import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
}, { timestamps: true });

const simulationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['investment', 'loan', 'credit-card', 'budget'], required: true },
  title: { type: String, trim: true, maxlength: 120, default: 'Untitled scenario' },
  schemaVersion: { type: Number, default: 1 },
  inputs: { type: mongoose.Schema.Types.Mixed, required: true },
  assumptions: { type: mongoose.Schema.Types.Mixed, required: true },
  results: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true, optimisticConcurrency: true });
simulationSchema.index({ userId: 1, updatedAt: -1 });

const comparisonSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, trim: true, maxlength: 120, default: 'Decision Replay' },
  schemaVersion: { type: Number, default: 1 },
  scenarioA: { type: mongoose.Schema.Types.Mixed, required: true },
  scenarioB: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Simulation = mongoose.models.Simulation || mongoose.model('Simulation', simulationSchema);
export const Comparison = mongoose.models.Comparison || mongoose.model('Comparison', comparisonSchema);
