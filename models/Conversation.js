import mongoose from 'mongoose';

const ConversationSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  prompt: {
    type: String,
    required: true
  },
  response: {
    type: String,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  userAnswers: [{
    questionIndex: Number,
    userAnswer: String,
    correct: Boolean,
    score: Number
  }]
});

// Crear un índice compuesto para buscar conversaciones por sesión y ordenarlas por tiempo
ConversationSchema.index({ sessionId: 1, timestamp: 1 });

const Conversation = mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);

export default Conversation;
