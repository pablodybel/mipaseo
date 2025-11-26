import { useState } from 'react'
import { useFetch } from '../../hooks/useFetch'
import { useMutation } from '../../hooks/useMutation'
import { useQueryClient } from '../../hooks/useQueryClient'
import { Star, User, Calendar, Clock, Edit2, CheckCircle } from 'lucide-react'
import { reviewsService } from '../../services/reviews'
import toast from 'react-hot-toast'

const ResenasPendientes = () => {
  const [selectedWalker, setSelectedWalker] = useState(null)
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [comment, setComment] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const queryClient = useQueryClient()

  // Obtener reseñas pendientes agrupadas por paseador
  const { data, isLoading, refetch } = useFetch(
    ['reviews', 'pending'],
    () => reviewsService.getPendingReviews()
  )

  const walkers = data?.walkers || []

  // Cuando se selecciona un paseador, cargar su reseña si existe
  const handleSelectWalker = (walkerData) => {
    setSelectedWalker(walkerData)
    if (walkerData.hasReview && walkerData.review) {
      setRating(walkerData.review.rating)
      setComment(walkerData.review.comment)
      setIsEditing(true)
    } else {
      setRating(0)
      setComment('')
      setIsEditing(false)
    }
  }

  const submitReview = useMutation(
    async (reviewData) => {
      const { walkerId, rating, comment } = reviewData
      return reviewsService.createReview(walkerId, rating, comment)
    },
    {
      onSuccess: () => {
        toast.success(isEditing ? 'Reseña actualizada exitosamente' : 'Reseña enviada exitosamente')
        setSelectedWalker(null)
        setRating(0)
        setComment('')
        setIsEditing(false)
        refetch()
        // Invalidar queries relacionadas
        queryClient.invalidateQueries(['reviews', 'pending'])
        queryClient.invalidateQueries(['reviews', 'mine'])
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Error al enviar la reseña')
      }
    }
  )

  const updateReview = useMutation(
    async (reviewData) => {
      const { reviewId, rating, comment } = reviewData
      return reviewsService.updateReview(reviewId, rating, comment)
    },
    {
      onSuccess: () => {
        toast.success('Reseña actualizada exitosamente')
        refetch()
        // Invalidar queries relacionadas
        queryClient.invalidateQueries(['reviews', 'pending'])
        queryClient.invalidateQueries(['reviews', 'mine'])
      },
      onError: (error) => {
        toast.error(error.response?.data?.error || 'Error al actualizar la reseña')
      }
    }
  )

  const handleSubmitReview = (e) => {
    e.preventDefault()
    
    if (rating === 0) {
      toast.error('Por favor selecciona una calificación')
      return
    }

    if (!comment || comment.trim().length < 10) {
      toast.error('El comentario debe tener al menos 10 caracteres')
      return
    }

    if (isEditing && selectedWalker.review) {
      // Actualizar reseña existente
      updateReview.mutate({
        reviewId: selectedWalker.review._id,
        rating,
        comment: comment.trim()
      })
    } else {
      // Crear nueva reseña
      submitReview.mutate({
        walkerId: selectedWalker.walker._id,
        rating,
        comment: comment.trim()
      })
    }
  }

  const handleCancel = () => {
    setSelectedWalker(null)
    setRating(0)
    setComment('')
    setIsEditing(false)
  }

  if (isLoading) {
    return <div className="flex justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Calificar Paseadores</h1>

      {walkers.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lista de paseadores */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Paseadores con los que has trabajado
            </h2>
            {walkers.map((walkerData) => (
              <div 
                key={walkerData.walker._id} 
                className={`card p-6 cursor-pointer transition-all ${
                  selectedWalker?.walker._id === walkerData.walker._id 
                    ? 'ring-2 ring-primary-500' 
                    : 'hover:shadow-lg'
                }`}
                onClick={() => handleSelectWalker(walkerData)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center mb-3">
                      {walkerData.walker.avatarUrl ? (
                        <img
                          src={`${import.meta.env.VITE_API_BASE?.replace('/api/v1', '') || 'http://localhost:4000'}${walkerData.walker.avatarUrl}`}
                          alt={walkerData.walker.name}
                          className="w-12 h-12 rounded-full object-cover mr-4"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mr-4">
                          <User className="h-6 w-6 text-gray-500" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {walkerData.walker.name}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {walkerData.completedWalks.length} {walkerData.completedWalks.length === 1 ? 'paseo completado' : 'paseos completados'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="space-y-1 text-sm text-gray-600 mb-2">
                      <div className="flex items-center">
                        <Calendar className="h-4 w-4 mr-2" />
                        <span>
                          Último paseo: {new Date(walkerData.lastWalkDate).toLocaleDateString('es-ES')}
                        </span>
                      </div>
                    </div>

                    {walkerData.hasReview && walkerData.review && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <div className="flex items-center mb-2">
                          <div className="flex">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <Star
                                key={star}
                                className={`h-4 w-4 ${
                                  star <= walkerData.review.rating
                                    ? 'fill-yellow-400 text-yellow-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
                        </div>
                        <p className="text-xs text-gray-500 italic line-clamp-2">
                          "{walkerData.review.comment}"
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Actualizada: {new Date(walkerData.review.updatedAt).toLocaleDateString('es-ES')}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className={`flex items-center ml-4 ${walkerData.hasReview ? 'text-green-500' : 'text-amber-500'}`}>
                    {walkerData.hasReview ? (
                      <>
                        <Edit2 className="h-5 w-5 mr-1" />
                        <span className="text-sm font-medium">Editar</span>
                      </>
                    ) : (
                      <>
                        <Star className="h-5 w-5 mr-1" />
                        <span className="text-sm font-medium">Calificar</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Formulario de reseña */}
          <div>
            {selectedWalker ? (
              <div className="card p-6 sticky top-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {isEditing ? 'Editar reseña de' : 'Calificar a'} {selectedWalker.walker.name}
                </h2>

                <form onSubmit={handleSubmitReview} className="space-y-6">
                  {/* Información del paseador */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">
                      Información
                    </h3>
                    <div className="space-y-1 text-sm text-gray-600">
                      <p>
                        • {selectedWalker.completedWalks.length} {selectedWalker.completedWalks.length === 1 ? 'paseo realizado' : 'paseos realizados'}
                      </p>
                      <p>
                        • Último paseo: {new Date(selectedWalker.lastWalkDate).toLocaleDateString('es-ES', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Rating con estrellas */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Calificación general <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center space-x-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          className="focus:outline-none transition-transform hover:scale-110"
                        >
                          <Star
                            className={`h-10 w-10 ${
                              star <= (hoverRating || rating)
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    {rating > 0 && (
                      <p className="mt-2 text-sm text-gray-600">
                        {rating === 1 && 'Muy malo'}
                        {rating === 2 && 'Malo'}
                        {rating === 3 && 'Regular'}
                        {rating === 4 && 'Bueno'}
                        {rating === 5 && 'Excelente'}
                      </p>
                    )}
                  </div>

                  {/* Comentario */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Comentario <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows="4"
                      className="input"
                      placeholder="Cuéntanos sobre tu experiencia con este paseador..."
                      minLength={10}
                      maxLength={500}
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      {comment.length}/500 caracteres (mínimo 10)
                    </p>
                  </div>

                  {/* Botones */}
                  <div className="flex space-x-3">
                    <button
                      type="submit"
                      disabled={rating === 0 || !comment || comment.trim().length < 10 || submitReview.isLoading || updateReview.isLoading}
                      className="btn-primary flex-1"
                    >
                      {(submitReview.isLoading || updateReview.isLoading) ? 'Guardando...' : (isEditing ? 'Actualizar Reseña' : 'Enviar Reseña')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="btn-outline"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="card p-12 text-center">
                <Star className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Selecciona un paseador
                </h3>
                <p className="text-gray-500">
                  Elige un paseador de la lista para calificar o editar tu reseña
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card p-12 text-center">
          <Star className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No hay paseadores para calificar
          </h3>
          <p className="text-gray-500">
            Completa algunos paseos para poder calificar a los paseadores
          </p>
        </div>
      )}
    </div>
  )
}

export default ResenasPendientes
