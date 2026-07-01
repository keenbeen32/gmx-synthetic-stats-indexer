import { EventData } from "../eventData";

export class ClaimableCollateralUpdatedEventData {
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

  get timeKey(): string {
    return this.eventData.getUintItem("timeKey")!.toString();
  }

  get delta(): bigint {
    return this.eventData.getUintItem("delta")!;
  }

  get nextValue(): bigint {
    return this.eventData.getUintItem("nextValue")!;
  }

  get nextPoolValue(): bigint {
    return this.eventData.getUintItem("nextPoolValue")!;
  }
}
