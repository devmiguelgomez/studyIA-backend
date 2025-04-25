import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['quiz', 'chat'],
    default: 'quiz'
  },
  questionType: {
    type: String,
    enum: ['multiple-choice', 'true-false', 'open-ended'],
    default: 'multiple-choice'
  },
  topic: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema);

export default Session;
