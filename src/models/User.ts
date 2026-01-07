// src/models/User.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IUser {
  // Authentication identifiers
  email: string;
  password?: string; // hashed password for credentials auth
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

type UserTransformRet = Record<string, unknown> & {
  _id?: unknown;
  __v?: unknown;
  password?: unknown;
};

const userTransform = ((
  _doc: unknown,
  ret: unknown,
): Record<string, unknown> & { id?: string } => {
  const r = ret as UserTransformRet;
  const { password, __v, _id, ...rest } = r;
  void password;
  void __v;

  return {
    ...rest,
    id: _id != null ? String(_id) : undefined,
  };
}) as unknown as (
  doc: unknown,
  ret: UserDocument,
  options: unknown,
) => unknown;

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