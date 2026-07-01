import { EventData } from "../eventData";

export class OraclePriceUpdateEventData {
  constructor(private eventData: EventData) {}

  get token(): string {
    return this.eventData.getAddressItemString("token")!;
  }

  get minPrice(): bigint {
    return this.eventData.getUintItem("minPrice")!;
  }

  get maxPrice(): bigint {
    return this.eventData.getUintItem("maxPrice")!;
  }

  get timestamp(): bigint {
    return this.eventData.getUintItem("timestamp")!;
  }

  get priceSourceType(): bigint {
    return this.eventData.getUintItem("priceSourceType")!;
  }
}
