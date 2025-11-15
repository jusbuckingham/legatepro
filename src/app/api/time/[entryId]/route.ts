import mongoose, { Document, Model, Schema } from "mongoose";

interface TimeEntryAttrs {
  date: Date;
  hours: number;
  rate?: number | null;
  description: string;
  notes?: string;
  isBillable: boolean;
}

interface TimeEntryDoc extends Document {
  date: Date;
  hours: number;
  rate?: number | null;
  description: string;
  notes?: string;
  isBillable: boolean;
}

interface TimeEntryModel extends Model<TimeEntryDoc> {
  build(attrs: TimeEntryAttrs): TimeEntryDoc;
}

const timeEntrySchema = new Schema<TimeEntryDoc>(
  {
    date: { type: Date, required: true },
    hours: { type: Number, required: true },
    rate: { type: Number, default: null },
    description: { type: String, required: true },
    notes: { type: String },
    isBillable: { type: Boolean, required: true },
  },
  {
    timestamps: true,
  }
);

timeEntrySchema.statics.build = (attrs: TimeEntryAttrs) => {
  return new TimeEntry(attrs);
};

const TimeEntry = mongoose.model<TimeEntryDoc, TimeEntryModel>(
  "TimeEntry",
  timeEntrySchema
);

export { TimeEntry };