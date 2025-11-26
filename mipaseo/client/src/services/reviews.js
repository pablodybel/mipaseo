import api from './api'

export const reviewsService = {
  // Obtener reseñas del usuario autenticado
  async getMyReviews(page = 1, limit = 10) {
    const response = await api.get(`/reviews/mine?page=${page}&limit=${limit}`)
    return response.data
  },

  // Obtener estadísticas de reseñas de un paseador
  async getWalkerStats(walkerId) {
    const response = await api.get(`/reviews/walker/${walkerId}/stats`)
    return response.data
  },

  // Crear o actualizar una reseña (una por paseador)
  async createReview(walkerId, rating, comment) {
    const response = await api.post('/reviews', {
      walkerId,
      rating,
      comment
    })
    return response.data
  },

  // Actualizar una reseña existente
  async updateReview(reviewId, rating, comment) {
    const response = await api.put(`/reviews/${reviewId}`, {
      rating,
      comment
    })
    return response.data
  },

  // Obtener reseña por walkerId
  async getReviewByWalker(walkerId) {
    const response = await api.get(`/reviews/walker/${walkerId}`)
    return response.data
  },

  // Obtener reseñas pendientes (para OWNER) - agrupadas por paseador
  async getPendingReviews() {
    const response = await api.get('/reviews/pending')
    return response.data
  }
}

