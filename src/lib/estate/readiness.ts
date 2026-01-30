import mongoose, { Types } from "mongoose";
// Import Mongoose models (adjust import paths as needed)
import { EstateDocument } from "../../models/EstateDocument";
import { EstateTask } from "../../models/EstateTask";
import { EstateProperty } from "../../models/EstateProperty";
import { Contact } from "../../models/Contact";
import { Invoice } from "../../models/Invoice";
import { Expense } from "../../models/Expense";

// Define TypeScript types for the readiness result
export interface ReadinessSignal {
  key: string;
  label: string;
  severity: "low" | "medium" | "high";
  /** Optional short explanation shown under the label in the UI */
  reason?: string;
  /** Optional count used for aggregated signals */
  count?: number;
}

export interface EstateReadinessBreakdown {
  documents: { score: number; max: number };
  tasks: { score: number; max: number };
  properties: { score: number; max: number };
  contacts: { score: number; max: number };
  finances: { score: number; max: number };
}

export interface EstateReadinessRaw {
  totalDocuments: number;
  presentDocumentSubjects: string[];
  missingDocumentSubjects: string[];
  totalTasks: number;
  completedTasks: number;
  incompleteTasks: number;
  overdueTasks: number;
  totalProperties: number;
  totalContacts: number;
  totalInvoices: number;
  totalExpenses: number;
}

export interface EstateReadinessResult {
  score: number;
  breakdown: EstateReadinessBreakdown;
  raw: EstateReadinessRaw;
  signals: {
    missing: ReadinessSignal[];
    atRisk: ReadinessSignal[];
  };
}

// Minimal shapes used by this scorer (kept intentionally small to avoid leaking model types)
interface DocLike {
  subject?: string;
  subjectType?: string;
  type?: string;
}

interface TaskLike {
  completed?: boolean;
  isComplete?: boolean;
  status?: string;
  completedAt?: Date | string | null;
  dueDate?: Date | string | null;
}

// For v1 we only need `.length` for these collections, so keep them flexible.
// Using `unknown` avoids requiring an index signature (which Mongoose Documents don’t have).
type PropertyLike = unknown;

type ContactLike = unknown;

type InvoiceLike = unknown;

type ExpenseLike = unknown;

// Helper constants for required document subjects and their metadata
const REQUIRED_DOCUMENT_SUBJECTS: string[] = ["LEGAL", "BANKING", "PROPERTY"];
const DOCUMENT_SUBJECT_METADATA: Record<
  string,
  {
    shortLabel: string;
    label: string;
    examples: string;
    severity: "low" | "medium" | "high";
  }
> = {
  LEGAL: {
    shortLabel: "Legal docs",
    label: "Legal documents",
    examples: "Will/trust, Letters of Authority/Administration, court orders, attorney filings",
    severity: "high",
  },
  BANKING: {
    shortLabel: "Banking docs",
    label: "Banking information",
    examples: "Account statements, beneficiary forms, bank correspondence, estate account setup docs",
    severity: "medium",
  },
  PROPERTY: {
    shortLabel: "Property docs",
    label: "Property ownership",
    examples: "Deeds, titles, insurance, mortgage statements, tax bills, HOA docs",
    severity: "medium",
  },
};

// Helper function to calculate document readiness score and signals
function calculateDocumentReadiness(documents: DocLike[]): {
  score: number;
  raw: Pick<
    EstateReadinessRaw,
    "totalDocuments" | "presentDocumentSubjects" | "missingDocumentSubjects"
  >;
  signals: { missing: ReadinessSignal[]; atRisk: ReadinessSignal[] };
} {
  const totalDocuments = documents.length;
  // Determine which required document subject types are present
  const presentSubjectsSet = new Set<string>();
  for (const doc of documents) {
    const subjectType: string | undefined = doc.subjectType || doc.subject || doc.type;
    if (subjectType) {
      presentSubjectsSet.add(subjectType.toUpperCase());
    }
  }
  const presentDocumentSubjects = Array.from(presentSubjectsSet);
  // Compute missing required document subjects
  const missingDocumentSubjects: string[] = [];
  for (const required of REQUIRED_DOCUMENT_SUBJECTS) {
    if (!presentSubjectsSet.has(required)) {
      missingDocumentSubjects.push(required);
    }
  }
  // Calculate score: evenly distribute 30 points across required document categories present
  let documentsScore = 0;
  if (REQUIRED_DOCUMENT_SUBJECTS.length > 0) {
    const pointsPerCategory = 30 / REQUIRED_DOCUMENT_SUBJECTS.length;
    const countPresent = REQUIRED_DOCUMENT_SUBJECTS.length - missingDocumentSubjects.length;
    // If pointsPerCategory is fractional, round to nearest for each present category and sum
    documentsScore = Math.round(countPresent * pointsPerCategory);
    // Ensure score does not exceed 30 due to rounding
    if (documentsScore > 30) documentsScore = 30;
  }
  // Assemble signals for missing document categories
  const missingSignals: ReadinessSignal[] = [];
  for (const missing of missingDocumentSubjects) {
    const meta = DOCUMENT_SUBJECT_METADATA[missing];
    const key = `missing_${missing.toLowerCase()}_documents`;

    if (meta) {
      missingSignals.push({
        key,
        label: `Add ${meta.label}`,
        reason: meta.examples,
        severity: meta.severity,
        count: 1,
      });
    } else {
      missingSignals.push({
        key,
        label: `Add ${missing.charAt(0).toUpperCase() + missing.slice(1).toLowerCase()} documents`,
        reason: "Add at least one document for this category so it’s easy to assemble a court packet later.",
        severity: "medium",
        count: 1,
      });
    }
  }
  // No atRisk signals for documents (at this time)
  const atRiskSignals: ReadinessSignal[] = [];
  return {
    score: documentsScore,
    raw: {
      totalDocuments,
      presentDocumentSubjects,
      missingDocumentSubjects,
    },
    signals: {
      missing: missingSignals,
      atRisk: atRiskSignals,
    },
  };
}

// Helper function to calculate task readiness score and signals
function calculateTaskReadiness(tasks: TaskLike[]): {
  score: number;
  raw: Pick<
    EstateReadinessRaw,
    "totalTasks" | "completedTasks" | "incompleteTasks" | "overdueTasks"
  >;
  signals: { missing: ReadinessSignal[]; atRisk: ReadinessSignal[] };
} {
  const totalTasks = tasks.length;
  let completedTasks = 0;
  let overdueTasks = 0;
  const now = new Date();
  // If there are no tasks, readiness score is 0 (considered missing tasks)
  if (totalTasks === 0) {
    return {
      score: 0,
      raw: {
        totalTasks,
        completedTasks: 0,
        incompleteTasks: 0,
        overdueTasks: 0,
      },
      signals: {
        missing: [
          {
            key: "no_tasks",
            label: "Create your first tasks",
            reason: "Start with inventory, notify banks, secure property, and track deadlines.",
            severity: "medium",
            count: 1,
          },
        ],
        atRisk: [], // no atRisk since no tasks exist to be overdue
      },
    };
  }
  // Count completed tasks and overdue tasks
  for (const task of tasks) {
    let isCompleted = false;
    if (typeof task.completed === "boolean") {
      isCompleted = isCompleted || task.completed;
    }
    if (typeof task.isComplete === "boolean") {
      isCompleted = isCompleted || task.isComplete;
    }
    if (task.status && typeof task.status === "string") {
      const statusVal = task.status.toLowerCase();
      if (statusVal === "completed" || statusVal === "done") {
        isCompleted = true;
      }
    }
    if (task.completedAt) {
      // If there's a completedAt timestamp, consider task completed
      isCompleted = isCompleted || true;
    }
    if (isCompleted) {
      completedTasks += 1;
    } else {
      // Task not completed: check if overdue
      if (task.dueDate) {
        const due = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
        if (!Number.isNaN(due.getTime()) && due < now) {
          overdueTasks += 1;
        }
      }
    }
  }
  const incompleteTasks = totalTasks - completedTasks;
  // Calculate score based on completion ratio (25 points max for tasks)
  const completionRatio = totalTasks > 0 ? completedTasks / totalTasks : 0;
  let tasksScore = Math.round(completionRatio * 25);
  // Apply penalty for overdue tasks (overdue tasks indicate lower readiness)
  if (overdueTasks >= 1) {
    // Subtract 5 points if there are any overdue tasks, and an additional 5 if 3 or more are overdue
    const overduePenalty = overdueTasks >= 3 ? 10 : 5;
    tasksScore -= overduePenalty;
  }
  if (tasksScore < 0) {
    tasksScore = 0;
  }
  // Signals: if any tasks are overdue, mark as atRisk
  const atRiskSignals: ReadinessSignal[] = [];
  if (overdueTasks > 0) {
    const labelText = overdueTasks === 1 ? "1 task is overdue" : `${overdueTasks} tasks are overdue`;
    const severity: "medium" | "high" = overdueTasks >= 3 ? "high" : "medium";
    atRiskSignals.push({
      key: "tasksOverdue",
      label: labelText,
      severity,
    });
  }
  // No missing signal here (we handled no tasks case above), incomplete tasks (not overdue) are not flagged as at risk in this calculation
  return {
    score: tasksScore,
    raw: {
      totalTasks,
      completedTasks,
      incompleteTasks,
      overdueTasks,
    },
    signals: {
      missing: [], // (no "missing" if some tasks exist)
      atRisk: atRiskSignals,
    },
  };
}

// Helper function to calculate property readiness score and signals
function calculatePropertyReadiness(properties: PropertyLike[]): {
  score: number;
  raw: Pick<EstateReadinessRaw, "totalProperties">;
  signals: { missing: ReadinessSignal[]; atRisk: ReadinessSignal[] };
} {
  const totalProperties = properties.length;
  // Property readiness does not penalize 0-property estates; keep the module at full points.
  const propertiesScore = 15;
  // We do not flag missing properties because a 0-property estate is not penalized
  return {
    score: propertiesScore,
    raw: { totalProperties },
    signals: {
      missing: [],
      atRisk: [],
    },
  };
}

// Helper function to calculate contact readiness score and signals
function calculateContactReadiness(contacts: ContactLike[]): {
  score: number;
  raw: Pick<EstateReadinessRaw, "totalContacts">;
  signals: { missing: ReadinessSignal[]; atRisk: ReadinessSignal[] };
} {
  const totalContacts = contacts.length;
  let contactsScore: number;
  const missingSignals: ReadinessSignal[] = [];
  if (totalContacts === 0) {
    contactsScore = 0;
    missingSignals.push({
      key: "no_contacts",
      label: "Add key contacts",
      reason: "Add heirs, attorneys, banks, creditors, and vendors so you can link tasks and payments.",
      severity: "high",
      count: 1,
    });
  } else {
    contactsScore = 15;
  }
  return {
    score: contactsScore,
    raw: { totalContacts },
    signals: {
      missing: missingSignals,
      atRisk: [],
    },
  };
}

// Helper function to calculate finance readiness score and signals
function calculateFinanceReadiness(
  invoices: InvoiceLike[],
  expenses: ExpenseLike[],
): {
  score: number;
  raw: Pick<EstateReadinessRaw, "totalInvoices" | "totalExpenses">;
  signals: { missing: ReadinessSignal[]; atRisk: ReadinessSignal[] };
} {
  const totalInvoices = invoices.length;
  const totalExpenses = expenses.length;
  const totalFinancialRecords = totalInvoices + totalExpenses;
  let financesScore: number;
  const missingSignals: ReadinessSignal[] = [];
  if (totalFinancialRecords === 0) {
    financesScore = 0;
    missingSignals.push({
      key: "no_finances",
      label: "Add an invoice or expense",
      reason: "Track bills, reimbursements, and estate payments so your final accounting is faster.",
      severity: "medium",
      count: 1,
    });
  } else {
    financesScore = 15;
  }
  return {
    score: financesScore,
    raw: {
      totalInvoices,
      totalExpenses,
    },
    signals: {
      missing: missingSignals,
      atRisk: [],
    },
  };
}

function toObjectId(id: Types.ObjectId | string): Types.ObjectId {
  if (typeof id !== "string") return id;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error("Invalid estateId");
  }

  return new mongoose.Types.ObjectId(id);
}

// Main function to get the estate readiness score and details
export async function getEstateReadiness(estateId: Types.ObjectId | string): Promise<EstateReadinessResult> {
  // Ensure estateId is in ObjectId form for queries
  const estateObjectId = toObjectId(estateId);

  // Fetch all relevant data in parallel (lean + minimal fields)
  const [documents, tasks, properties, contacts, invoices, expenses] = await Promise.all([
    EstateDocument.find({ estateId: estateObjectId })
      .select({ subject: 1, subjectType: 1, type: 1 })
      .lean()
      .exec(),
    EstateTask.find({ estateId: estateObjectId })
      .select({ completed: 1, isComplete: 1, status: 1, completedAt: 1, dueDate: 1 })
      .lean()
      .exec(),
    EstateProperty.find({ estateId: estateObjectId }).select({ _id: 1 }).lean().exec(),
    Contact.find({ estateId: estateObjectId }).select({ _id: 1 }).lean().exec(),
    Invoice.find({ estateId: estateObjectId }).select({ _id: 1 }).lean().exec(),
    Expense.find({ estateId: estateObjectId }).select({ _id: 1 }).lean().exec(),
  ]);
  // Calculate readiness for each module
  const docResult = calculateDocumentReadiness(documents as unknown as DocLike[]);
  const taskResult = calculateTaskReadiness(tasks as unknown as TaskLike[]);
  const propertyResult = calculatePropertyReadiness(properties as unknown as PropertyLike[]);
  const contactResult = calculateContactReadiness(contacts as unknown as ContactLike[]);
  const financeResult = calculateFinanceReadiness(
    invoices as unknown as InvoiceLike[],
    expenses as unknown as ExpenseLike[],
  );
  // Total score is sum of module scores (capped at 100 just in case)
  let totalScore = docResult.score + taskResult.score + propertyResult.score + contactResult.score + financeResult.score;
  if (totalScore > 100) {
    totalScore = 100;
  }
  // Assemble final result object
  const readinessResult: EstateReadinessResult = {
    score: totalScore,
    breakdown: {
      documents: { score: docResult.score, max: 30 },
      tasks: { score: taskResult.score, max: 25 },
      properties: { score: propertyResult.score, max: 15 },
      contacts: { score: contactResult.score, max: 15 },
      finances: { score: financeResult.score, max: 15 },
    },
    raw: {
      totalDocuments: docResult.raw.totalDocuments,
      presentDocumentSubjects: docResult.raw.presentDocumentSubjects,
      missingDocumentSubjects: docResult.raw.missingDocumentSubjects,
      totalTasks: taskResult.raw.totalTasks,
      completedTasks: taskResult.raw.completedTasks,
      incompleteTasks: taskResult.raw.incompleteTasks,
      overdueTasks: taskResult.raw.overdueTasks,
      totalProperties: propertyResult.raw.totalProperties,
      totalContacts: contactResult.raw.totalContacts,
      totalInvoices: financeResult.raw.totalInvoices,
      totalExpenses: financeResult.raw.totalExpenses,
    },
    signals: {
      missing: [
        ...docResult.signals.missing,
        ...taskResult.signals.missing,
        ...contactResult.signals.missing,
        ...financeResult.signals.missing,
      ],
      atRisk: [
        ...docResult.signals.atRisk,
        ...taskResult.signals.atRisk,
        ...propertyResult.signals.atRisk,
        ...contactResult.signals.atRisk,
        ...financeResult.signals.atRisk,
      ],
    },
  };
  return readinessResult;
}

export default getEstateReadiness;