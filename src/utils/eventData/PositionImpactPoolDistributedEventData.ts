import { EventData } from "../eventData";

export class PositionImpactPoolDistributedEventData {
  constructor(private eventData: EventData) {}

  get market(): string {
    return this.eventData.getAddressItemString("market")!;
  }

  get distributionAmount(): bigint {
    return this.eventData.getUintItem("distributionAmount")!;
  }

  get nextPositionImpactPoolAmount(): bigint {
    return this.eventData.getUintItem("nextPositionImpactPoolAmount")!;
  }
}
