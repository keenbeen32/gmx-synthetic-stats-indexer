import { EventData } from "../eventData";

export class SetClaimableCollateralFactorForAccountEventData {
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

  get factor(): bigint {
    return this.eventData.getUintItem("factor")!;
  }
}
