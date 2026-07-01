import { EventData } from "../eventData";

export class SetClaimableCollateralFactorForTimeEventData {
  constructor(private eventData: EventData) {}

  get market(): string {
    return this.eventData.getAddressItemString("market")!;
  }

  get token(): string {
    return this.eventData.getAddressItemString("token")!;
  }

  get timeKey(): string {
    return this.eventData.getUintItem("timeKey")!.toString();
  }

  get factor(): bigint {
    return this.eventData.getUintItem("factor")!;
  }
}
