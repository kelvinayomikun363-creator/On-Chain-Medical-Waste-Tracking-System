import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, ClarityType, cvToValue, stringAsciiCV, uintCV, OptionalCV, intCV, bufferCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_WASTE_ID = 101;
const ERR_INVALID_RECEIVER = 103;
const ERR_INVALID_GEO_DATA = 105;
const ERR_TRANSFER_NOT_ALLOWED = 106;
const ERR_WASTE_NOT_FOUND = 107;
const ERR_ALREADY_DISPOSED = 108;
const ERR_INVALID_METADATA = 109;
const ERR_MAX_TRANSFERS_EXCEEDED = 110;
const ERR_INVALID_TRANSFER_TYPE = 112;
const ERR_INVALID_QUANTITY = 113;
const ERR_INVALID_HASH = 114;
const ERR_INVALID_ROLE = 115;
const ERR_TRANSFER_PAUSED = 116;
const ERR_INVALID_EXPIRY = 118;

type Transfer = {
  transferId: number;
  sender: string;
  receiver: string;
  timestamp: number;
  geoLat: number | null;
  geoLong: number | null;
  metadata: string;
  transferType: string;
  quantity: number;
  hash: Uint8Array;
  status: boolean;
  expiry: number;
};

type WasteStatus = {
  currentHolder: string;
  disposed: boolean;
  totalTransfers: number;
};

type Result<T> = { ok: boolean; value: T };

class TransferTrackerMock {
  state: {
    nextTransferId: number;
    maxTransfersPerWaste: number;
    transferFee: number;
    paused: boolean;
    authority: string;
    wasteTransfers: Map<number, Transfer[]>;
    wasteStatus: Map<number, WasteStatus>;
    authorizedRoles: Map<string, string>;
  } = {
    nextTransferId: 0,
    maxTransfersPerWaste: 50,
    transferFee: 100,
    paused: false,
    authority: "ST1AUTH",
    wasteTransfers: new Map(),
    wasteStatus: new Map(),
    authorizedRoles: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1CALLER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextTransferId: 0,
      maxTransfersPerWaste: 50,
      transferFee: 100,
      paused: false,
      authority: "ST1AUTH",
      wasteTransfers: new Map(),
      wasteStatus: new Map(),
      authorizedRoles: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1CALLER";
    this.stxTransfers = [];
  }

  getTransferHistory(wasteId: number): Transfer[] | null {
    return this.state.wasteTransfers.get(wasteId) || null;
  }

  getWasteStatus(wasteId: number): WasteStatus | null {
    return this.state.wasteStatus.get(wasteId) || null;
  }

  getRole(user: string): string | null {
    return this.state.authorizedRoles.get(user) || null;
  }

  setPaused(newPaused: boolean): Result<boolean> {
    if (this.caller !== this.state.authority) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.paused = newPaused;
    return { ok: true, value: true };
  }

  setTransferFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.authority) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.transferFee = newFee;
    return { ok: true, value: true };
  }

  assignRole(user: string, role: string): Result<boolean> {
    if (this.caller !== this.state.authority) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!["generator", "transporter", "disposer", "regulator"].includes(role)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.authorizedRoles.set(user, role);
    return { ok: true, value: true };
  }

  initiateTransfer(
    wasteId: number,
    receiver: string,
    geoLat: number | null,
    geoLong: number | null,
    metadata: string,
    transferType: string,
    quantity: number,
    hash: Uint8Array,
    expiry: number
  ): Result<number> {
    if (this.state.paused) return { ok: false, value: ERR_TRANSFER_PAUSED };
    if (wasteId <= 0) return { ok: false, value: ERR_INVALID_WASTE_ID };
    if (receiver === this.caller) return { ok: false, value: ERR_INVALID_RECEIVER };
    if (geoLat !== null && (geoLat < -90 || geoLat > 90)) return { ok: false, value: ERR_INVALID_GEO_DATA };
    if (geoLong !== null && (geoLong < -180 || geoLong > 180)) return { ok: false, value: ERR_INVALID_GEO_DATA };
    if (metadata.length > 256) return { ok: false, value: ERR_INVALID_METADATA };
    if (!["handover", "transport", "disposal"].includes(transferType)) return { ok: false, value: ERR_INVALID_TRANSFER_TYPE };
    if (quantity <= 0) return { ok: false, value: ERR_INVALID_QUANTITY };
    if (hash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (expiry <= this.blockHeight) return { ok: false, value: ERR_INVALID_EXPIRY };
    const senderRole = this.getRole(this.caller);
    if (!senderRole) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const receiverRole = this.getRole(receiver);
    if (!receiverRole) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const status = this.getWasteStatus(wasteId);
    if (!status) return { ok: false, value: ERR_WASTE_NOT_FOUND };
    if (status.disposed) return { ok: false, value: ERR_ALREADY_DISPOSED };
    if (status.currentHolder !== this.caller) return { ok: false, value: ERR_TRANSFER_NOT_ALLOWED };
    if (status.totalTransfers >= this.state.maxTransfersPerWaste) return { ok: false, value: ERR_MAX_TRANSFERS_EXCEEDED };
    this.stxTransfers.push({ amount: this.state.transferFee, from: this.caller, to: this.state.authority });
    const transferId = this.state.nextTransferId;
    const newTransfer: Transfer = {
      transferId,
      sender: this.caller,
      receiver,
      timestamp: this.blockHeight,
      geoLat,
      geoLong,
      metadata,
      transferType,
      quantity,
      hash,
      status: true,
      expiry,
    };
    const history = this.state.wasteTransfers.get(wasteId) || [];
    history.push(newTransfer);
    this.state.wasteTransfers.set(wasteId, history);
    this.state.wasteStatus.set(wasteId, {
      currentHolder: receiver,
      disposed: status.disposed,
      totalTransfers: status.totalTransfers + 1
    });
    this.state.nextTransferId += 1;
    return { ok: true, value: transferId };
  }

  markDisposed(wasteId: number): Result<boolean> {
    const status = this.getWasteStatus(wasteId);
    if (!status) return { ok: false, value: ERR_WASTE_NOT_FOUND };
    if (status.currentHolder !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (status.disposed) return { ok: false, value: ERR_ALREADY_DISPOSED };
    status.disposed = true;
    return { ok: true, value: true };
  }

  getLastTransfer(wasteId: number): Transfer | null {
    const history = this.state.wasteTransfers.get(wasteId) || [];
    return history.length > 0 ? history[history.length - 1] : null;
  }
}

describe("TransferTracker", () => {
  let contract: TransferTrackerMock;

  beforeEach(() => {
    contract = new TransferTrackerMock();
    contract.reset();
    contract.caller = "ST1AUTH";
  });

  it("assigns role successfully", () => {
    const result = contract.assignRole("ST2USER", "transporter");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getRole("ST2USER")).toBe("transporter");
  });

  it("rejects invalid role assignment", () => {
    const result = contract.assignRole("ST2USER", "invalid");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("initiates transfer successfully", () => {
    contract.assignRole("ST1CALLER", "generator");
    contract.assignRole("ST2RECEIVER", "transporter");
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: false, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, "ST2RECEIVER", 40, -74, "Meta data", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const history = contract.getTransferHistory(1);
    expect(history?.length).toBe(1);
    expect(history?.[0].receiver).toBe("ST2RECEIVER");
    const status = contract.getWasteStatus(1);
    expect(status?.currentHolder).toBe("ST2RECEIVER");
    expect(status?.totalTransfers).toBe(1);
    expect(contract.stxTransfers).toEqual([{ amount: 100, from: "ST1CALLER", to: "ST1AUTH" }]);
  });

  it("rejects transfer when paused", () => {
    contract.setPaused(true);
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, "ST2RECEIVER", null, null, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_PAUSED);
  });

  it("rejects invalid waste id", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(0, "ST2RECEIVER", null, null, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_WASTE_ID);
  });

  it("rejects transfer to self", () => {
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, contract.caller, null, null, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RECEIVER);
  });

  it("rejects invalid geo data", () => {
    contract.assignRole("ST1CALLER", "generator");
    contract.assignRole("ST2RECEIVER", "transporter");
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: false, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, "ST2RECEIVER", 100, -74, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_GEO_DATA);
  });

  it("rejects without roles", () => {
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: false, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, "ST2RECEIVER", null, null, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects if not current holder", () => {
    contract.assignRole("ST1CALLER", "generator");
    contract.assignRole("ST2RECEIVER", "transporter");
    contract.state.wasteStatus.set(1, { currentHolder: "ST3OTHER", disposed: false, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, "ST2RECEIVER", null, null, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_NOT_ALLOWED);
  });

  it("rejects if already disposed", () => {
    contract.assignRole("ST1CALLER", "generator");
    contract.assignRole("ST2RECEIVER", "transporter");
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: true, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, "ST2RECEIVER", null, null, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_DISPOSED);
  });

  it("rejects max transfers exceeded", () => {
    contract.assignRole("ST1CALLER", "generator");
    contract.assignRole("ST2RECEIVER", "transporter");
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: false, totalTransfers: 50 });
    contract.caller = "ST1CALLER";
    const hash = new Uint8Array(32).fill(0);
    const result = contract.initiateTransfer(1, "ST2RECEIVER", null, null, "Meta", "handover", 100, hash, contract.blockHeight + 10);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_TRANSFERS_EXCEEDED);
  });

  it("marks disposed successfully", () => {
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: false, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const result = contract.markDisposed(1);
    expect(result.ok).toBe(true);
    const status = contract.getWasteStatus(1);
    expect(status?.disposed).toBe(true);
  });

  it("rejects mark disposed if not holder", () => {
    contract.state.wasteStatus.set(1, { currentHolder: "ST3OTHER", disposed: false, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const result = contract.markDisposed(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects mark disposed if already disposed", () => {
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: true, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const result = contract.markDisposed(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_DISPOSED);
  });

  it("gets last transfer correctly", () => {
    contract.assignRole("ST1CALLER", "generator");
    contract.assignRole("ST2RECEIVER", "transporter");
    contract.assignRole("ST3DISPOSER", "disposer");
    contract.state.wasteStatus.set(1, { currentHolder: "ST1CALLER", disposed: false, totalTransfers: 0 });
    contract.caller = "ST1CALLER";
    const hash = new Uint8Array(32).fill(0);
    contract.initiateTransfer(1, "ST2RECEIVER", null, null, "Meta1", "handover", 100, hash, contract.blockHeight + 10);
    contract.caller = "ST2RECEIVER";
    contract.state.wasteStatus.set(1, { currentHolder: "ST2RECEIVER", disposed: false, totalTransfers: 1 });
    contract.initiateTransfer(1, "ST3DISPOSER", null, null, "Meta2", "transport", 100, hash, contract.blockHeight + 10);
    const last = contract.getLastTransfer(1);
    expect(last?.metadata).toBe("Meta2");
  });

  it("sets transfer fee successfully", () => {
    contract.caller = "ST1AUTH";
    const result = contract.setTransferFee(200);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.transferFee).toBe(200);
  });

  it("rejects set transfer fee by non-authority", () => {
    contract.caller = "ST1CALLER";
    const result = contract.setTransferFee(200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});