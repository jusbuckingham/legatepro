// src/models/User.ts
import mongoose, { Schema, Document } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";

export interface IUser {
  // Authentication identifiers
  email: string;
  // Credentials auth (bcrypt hash)
  // NOTE: `password` kept only for backward-compat migrations.
  passwordHash?: string;
  authProvider?: "google" | "apple" | "password" | "github" | "magiclink";
  providerId?: string; // e.g. Google sub, Apple id, etc.

  // Profile details
  firstName?: string;
  lastName?: string;
  phone?: string;

  // Billing / subscription
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  // Billing state mirrors Stripe subscription lifecycle
  subscriptionStatus?: "free" | "trialing" | "active" | "past_due" | "canceled";

  // App metadata
  onboardingCompleted?: boolean;
  lastLoginAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;

  role?: "user" | "admin";
}

export interface UserDocument extends IUser, Document {}

const UserSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: { unique: true },
      lowercase: true,
      trim: true,
      validate: {
        validator: (v: string) => /^\S+@\S+\.\S+$/.test(v),
        message: (props: { value: string }) =>
          `${props.value} is not a valid email`,
      },
    },

    // Credentials auth (bcrypt hash)
    // NOTE: We intentionally allow this field to be selected by default because
    // our Credentials `authorize()` uses `.lean()` and does not call `.select("+passwordHash")`.
    // We still prevent accidental leakage by stripping these fields in `toJSON`/`toObject` below.
    passwordHash: { type: String, required: false },

    authProvider: {
      type: String,
      enum: ["google", "apple", "password", "github", "magiclink"],
      default: "password",
    },

    providerId: { type: String },

    firstName: { type: String, trim: true, maxlength: 50 },
    lastName: { type: String, trim: true, maxlength: 50 },
    phone: { type: String, trim: true, maxlength: 25 },

    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    // Billing state mirrors Stripe subscription lifecycle
    subscriptionStatus: {
      type: String,
      enum: ["free", "trialing", "active", "past_due", "canceled"],
      default: "free",
      required: true,
    },

    onboardingCompleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ stripeCustomerId: 1 });

UserSchema.virtual("fullName").get(function (this: UserDocument) {
  return [this.firstName, this.lastName].filter(Boolean).join(" ");
});

const userTransform = (_doc: unknown, ret: unknown) => {
  const out = serializeMongoDoc(ret) as Record<string, unknown>;
  // Never leak password hashes
  delete (out as { password?: unknown }).password;
  delete (out as { passwordHash?: unknown }).passwordHash;
  return out;
};

UserSchema.set("toJSON", {
  transform: userTransform,
});

UserSchema.set("toObject", {
  transform: userTransform,
});

export const User =
  (mongoose.models.User as mongoose.Model<UserDocument>) ||
  mongoose.model<UserDocument>("User", UserSchema);