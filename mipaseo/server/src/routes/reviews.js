import express from 'express'
import mongoose from 'mongoose'
import { Review, WalkRequest, User } from '../models/index.js'
import { authenticate, authorize } from '../middleware/auth.js'
import { validate, createReviewSchema, updateReviewSchema } from '../utils/validation.js'

const router = express.Router()

router.post('/', authenticate, authorize('OWNER'), validate(createReviewSchema), async (req, res) => {
  try {
    const { walkerId, rating, comment } = req.validatedData

    // Verificar que el paseador existe y tiene rol WALKER
    const walker = await User.findById(walkerId)
    if (!walker || walker.role !== 'WALKER') {
      return res.status(404).json({ error: 'Paseador no encontrado' })
    }

    // Verificar que el dueño tiene al menos un paseo completado con este paseador
    const completedWalk = await WalkRequest.findOne({
      ownerId: req.user._id,
      walkerId: walkerId,
      status: 'COMPLETED'
    })

    if (!completedWalk) {
      return res.status(400).json({ error: 'Debes tener al menos un paseo completado con este paseador para calificarlo' })
    }

    // Buscar si ya existe una reseña para este dueño-paseador
    let review = await Review.findOne({
      ownerId: req.user._id,
      walkerId: walkerId
    })

    const isNew = !review

    if (review) {
      // Actualizar reseña existente
      review.rating = rating
      review.comment = comment
      review.walkRequestId = completedWalk._id // Actualizar referencia al último paseo
      await review.save()
    } else {
      // Crear nueva reseña
      review = new Review({
        walkRequestId: completedWalk._id,
        ownerId: req.user._id,
        walkerId: walkerId,
        rating,
        comment
      })
      await review.save()
    }

    await review.populate([
      { path: 'ownerId', select: 'name' },
      { path: 'walkerId', select: 'name avatarUrl' },
      { path: 'walkRequestId', select: 'scheduledAt durationMin', populate: { path: 'petId', select: 'name breed' } }
    ])

    res.status(isNew ? 201 : 200).json({
      message: isNew ? 'Reseña creada exitosamente' : 'Reseña actualizada exitosamente',
      review
    })
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Ya existe una reseña para este paseador' })
    }
    console.error('Error creando/actualizando reseña:', error)
    res.status(500).json({ error: 'Error al crear/actualizar reseña' })
  }
})

router.get('/mine', authenticate, async (req, res) => {
  const { page = 1, limit = 10 } = req.query
  const skip = (page - 1) * limit

  let query = {}
  if (req.user.role === 'OWNER') {
    query.ownerId = req.user._id
  } else if (req.user.role === 'WALKER') {
    query.walkerId = req.user._id
  }

  const [reviews, total] = await Promise.all([
    Review.find(query)
      .populate('ownerId', 'name')
      .populate('walkerId', 'name')
      .populate({
        path: 'walkRequestId',
        select: 'scheduledAt durationMin',
        populate: { path: 'petId', select: 'name breed' }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Review.countDocuments(query)
  ])

  res.json({
    reviews,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  })
})

router.get('/walker/:walkerId/stats', async (req, res) => {
  try {
    const { walkerId } = req.params

    const walker = await User.findOne({
      _id: walkerId,
      role: 'WALKER',
      isActive: true
    })

    if (!walker) {
      return res.status(404).json({ error: 'Paseador no encontrado' })
    }

    const [ratingData, ratingDistribution] = await Promise.all([
      Review.getAverageRating(walkerId),
      Review.aggregate([
        { $match: { walkerId: new mongoose.Types.ObjectId(walkerId) } },
        {
          $group: {
            _id: '$rating',
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: -1 } }
      ])
    ])

    const distribution = {}
    for (let i = 1; i <= 5; i++) {
      distribution[i] = 0
    }
    ratingDistribution.forEach(item => {
      distribution[item._id] = item.count
    })

    res.json({
      walkerId,
      averageRating: ratingData.averageRating,
      totalReviews: ratingData.totalReviews,
      ratingDistribution: distribution
    })
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error)
    res.status(500).json({ error: 'Error al obtener estadísticas' })
  }
})

router.get('/pending', authenticate, authorize('OWNER'), async (req, res) => {
  try {
    // Obtener todos los paseos completados del dueño
    const completedWalks = await WalkRequest.find({
      ownerId: req.user._id,
      status: 'COMPLETED'
    }).populate([
      { path: 'walkerId', select: 'name avatarUrl' },
      { path: 'petId', select: 'name breed' }
    ])

    // Obtener todas las reseñas existentes del dueño
    const existingReviews = await Review.find({
      ownerId: req.user._id
    }).populate('walkerId', 'name avatarUrl')

    // Crear mapa de reseñas por walkerId
    const reviewsByWalker = new Map()
    existingReviews.forEach(review => {
      reviewsByWalker.set(review.walkerId._id.toString(), review)
    })

    // Agrupar paseos por paseador
    const walkersMap = new Map()

    completedWalks.forEach(walk => {
      const walkerId = walk.walkerId._id.toString()
      
      if (!walkersMap.has(walkerId)) {
        const existingReview = reviewsByWalker.get(walkerId)
        walkersMap.set(walkerId, {
          walker: walk.walkerId,
          completedWalks: [],
          lastWalkDate: walk.scheduledAt,
          hasReview: !!existingReview,
          review: existingReview ? {
            _id: existingReview._id,
            rating: existingReview.rating,
            comment: existingReview.comment,
            updatedAt: existingReview.updatedAt
          } : null
        })
      }

      const walkerData = walkersMap.get(walkerId)
      walkerData.completedWalks.push({
        walkRequestId: walk._id,
        scheduledAt: walk.scheduledAt,
        durationMin: walk.durationMin,
        completedAt: walk.completedAt,
        pet: walk.petId,
        walkerNotes: walk.walkerNotes
      })

      // Actualizar última fecha
      if (new Date(walk.scheduledAt) > new Date(walkerData.lastWalkDate)) {
        walkerData.lastWalkDate = walk.scheduledAt
      }
    })

    // Convertir a array y ordenar por última fecha
    const walkersData = Array.from(walkersMap.values())
      .sort((a, b) => new Date(b.lastWalkDate) - new Date(a.lastWalkDate))

    res.json({
      walkers: walkersData
    })
  } catch (error) {
    console.error('Error obteniendo reseñas pendientes:', error)
    res.status(500).json({ error: 'Error al obtener reseñas pendientes' })
  }
})

// Endpoint para editar una reseña
router.put('/:id', authenticate, authorize('OWNER'), validate(updateReviewSchema), async (req, res) => {
  try {
    const { id } = req.params
    const { rating, comment } = req.validatedData

    const review = await Review.findById(id)
    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' })
    }

    // Verificar que el dueño es el propietario de la reseña
    if (review.ownerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'No tienes permisos para editar esta reseña' })
    }

    // Actualizar campos si se proporcionaron
    if (rating !== undefined) {
      review.rating = rating
    }
    if (comment !== undefined) {
      review.comment = comment
    }

    await review.save()
    await review.populate([
      { path: 'ownerId', select: 'name' },
      { path: 'walkerId', select: 'name avatarUrl' },
      { path: 'walkRequestId', select: 'scheduledAt durationMin', populate: { path: 'petId', select: 'name breed' } }
    ])

    res.json({
      message: 'Reseña actualizada exitosamente',
      review
    })
  } catch (error) {
    console.error('Error actualizando reseña:', error)
    res.status(500).json({ error: 'Error al actualizar reseña' })
  }
})

// Obtener reseña por walkerId (para el dueño)
router.get('/walker/:walkerId', authenticate, authorize('OWNER'), async (req, res) => {
  try {
    const { walkerId } = req.params

    const review = await Review.findOne({
      ownerId: req.user._id,
      walkerId: walkerId
    })
      .populate('ownerId', 'name')
      .populate('walkerId', 'name avatarUrl')
      .populate({
        path: 'walkRequestId',
        select: 'scheduledAt durationMin completedAt walkerNotes',
        populate: { path: 'petId', select: 'name breed photoUrl' }
      })

    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' })
    }

    res.json({ review })
  } catch (error) {
    console.error('Error obteniendo reseña:', error)
    res.status(500).json({ error: 'Error al obtener reseña' })
  }
})

router.get('/:id', authenticate, async (req, res) => {
  const { id } = req.params

  const review = await Review.findById(id)
    .populate('ownerId', 'name')
    .populate('walkerId', 'name avatarUrl')
    .populate({
      path: 'walkRequestId',
      select: 'scheduledAt durationMin completedAt walkerNotes',
      populate: { path: 'petId', select: 'name breed photoUrl' }
    })

  if (!review) {
    return res.status(404).json({ error: 'Reseña no encontrada' })
  }

  if (review.ownerId._id.toString() !== req.user._id.toString() &&
      review.walkerId._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ error: 'No tienes permisos para ver esta reseña' })
  }

  res.json({ review })
})

export default router