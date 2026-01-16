// src/models/User.ts
import mongoose, { Schema, Document, Model } from "mongoose";
import { serializeMongoDoc } from "@/lib/db";

export interface IUser {
  // Authentication identifiers
  email: string;
  // Credentials auth (bcrypt hash)
  // NOTE: `password` kept only for backward-compat migrations.
  passwordHash?: string;
  password?: string;
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

    // Backward-compat (older records may have `password`)
    // Kept for one-time migration on successful login.
    password: { type: String, required: false },

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
      default: "trialing",
    },

    onboardingCompleted: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

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

let UserModel: Model<UserDocument>;

try {
  UserModel = mongoose.model<UserDocument>("User");
} catch {
  UserModel = mongoose.model<UserDocument>("User", UserSchema);
}

export const User = UserModel;