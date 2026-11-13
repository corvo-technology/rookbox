import type { MachineSize, MachineTemplate } from "@rookbox/contracts";
import type { Db } from "../db.js";
import type { MachineOp } from "./state.js";

export type MachineRow = {
  id: string;
  ownerId: string;
  name: string;
  template: MachineTemplate;
  size: MachineSize;
  forkedFrom: string | null;
  op: MachineOp | null;
  opAt: Date | null;
  createdAt: Date;
};

/** Ownership and bookkeeping for machines. Every read is scoped to an owner. */
export interface MachineStore {
  listByOwner(ownerId: string): Promise<MachineRow[]>;
  find(ownerId: string, id: string): Promise<MachineRow | null>;
  insert(
    row: Omit<MachineRow, "op" | "opAt" | "createdAt"> & { createdAt?: Date },
  ): Promise<MachineRow>;
  setOp(id: string, op: MachineOp | null): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Thrown by `insert` when the owner already has a machine with that name. */
export class DuplicateNameError extends Error {}

function toRow(row: {
  id: string;
  ownerId: string;
  name: string;
  template: string;
  vcpu: number;
  memoryMib: number;
  diskMib: number;
  forkedFrom: string | null;
  op: string | null;
  opAt: Date | null;
  createdAt: Date;
}): MachineRow {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    template: row.template as MachineTemplate,
    size: { vcpu: row.vcpu, memoryMib: row.memoryMib, diskMib: row.diskMib },
    forkedFrom: row.forkedFrom,
    op: row.op as MachineOp | null,
    opAt: row.opAt,
    createdAt: row.createdAt,
  };
}

export function createPrismaMachineStore(db: Db): MachineStore {
  return {
    async listByOwner(ownerId) {
      const rows = await db.machine.findMany({
        where: { ownerId },
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toRow);
    },
    async find(ownerId, id) {
      const row = await db.machine.findFirst({ where: { id, ownerId } });
      return row ? toRow(row) : null;
    },
    async insert(row) {
      try {
        const created = await db.machine.create({
          data: {
            id: row.id,
            ownerId: row.ownerId,
            name: row.name,
            template: row.template,
            vcpu: row.size.vcpu,
            memoryMib: row.size.memoryMib,
            diskMib: row.size.diskMib,
            forkedFrom: row.forkedFrom,
            ...(row.createdAt ? { createdAt: row.createdAt } : {}),
          },
        });
        return toRow(created);
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") throw new DuplicateNameError(row.name);
        throw error;
      }
    },
    async setOp(id, op) {
      await db.machine.updateMany({ where: { id }, data: { op, opAt: op ? new Date() : null } });
    },
    async remove(id) {
      await db.machine.deleteMany({ where: { id } });
    },
  };
}
