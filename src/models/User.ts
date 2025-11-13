

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser {
  // Authentication identifiers
  email: string;
  passwordHash?: string; // if using password auth later
  authProvider?: "google" | "apple" | "password" | "github" | "magiclink";
  providerId?: string; // e.g. Google sub, Apple id, etc.

  // Profile details
  firstName?: string;
  lastName?: string;
  phone?: string;

  // Billing / subscription
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: "active" | "past_due" | "canceled" | "trialing";

  // App metadata
  onboardingCompleted?: boolean;
  lastLoginAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export interface UserDocument extends IUser, Document {}

const UserSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    passwordHash: { type: String, required: false },
    authProvider: {
      type: String,
      enum: ["google", "apple", "password", "github", "magiclink"],
      default: "password",
    },

    providerId: { type: String },

    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    phone: { type: String, trim: true },

    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    subscriptionStatus: {
      type: String,
      enum: ["active", "past_due", "canceled", "trialing"],
    },

    onboardingCompleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

let UserModel: Model<UserDocument>;

try {
  UserModel = mongoose.model<UserDocument>("User");
} catch {
  UserModel = mongoose.model<UserDocument>("User", UserSchema);
}

export const User = UserModel;