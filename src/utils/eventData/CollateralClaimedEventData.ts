import { EventData } from "../eventData";

export class CollateralClaimedEventData {
  constructor(private eventData: EventData) {}

  get market(): string {
    return this.eventData.getAddressItemString("market")!;
  }

  get token(): string {
    return this.eventData.getAddressItemString("token")!;
  }

  get account(): string {
    return this.eventData.getAddressItemString("account")!;
  }

  get receiver(): string {
    return this.eventData.getAddressItemString("receiver")!;
  }

  get timeKey(): string {
    return this.eventData.getUintItem("timeKey")!.toString();
  }

  get amount(): bigint {
    return this.eventData.getUintItem("amount")!;
  }

  get nextPoolValue(): bigint {
    return this.eventData.getUintItem("nextPoolValue")!;
  }
}
