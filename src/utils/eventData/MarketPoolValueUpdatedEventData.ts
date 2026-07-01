import { EventData } from "../eventData";

export class MarketPoolValueUpdatedEventData {
  constructor(private eventData: EventData) {}

  get market(): string {
    return this.eventData.getAddressItemString("market")!;
  }

  get longTokenAmount(): bigint {
    return this.eventData.getUintItem("longTokenAmount")!;
  }

  get shortTokenAmount(): bigint {
    return this.eventData.getUintItem("shortTokenAmount")!;
  }

  get longTokenUsd(): bigint {
    return this.eventData.getUintItem("longTokenUsd")!;
  }

  get shortTokenUsd(): bigint {
    return this.eventData.getUintItem("shortTokenUsd")!;
  }

  get totalBorrowingFees(): bigint {
    return this.eventData.getUintItem("totalBorrowingFees")!;
  }

  get borrowingFeePoolFactor(): bigint {
    return this.eventData.getUintItem("borrowingFeePoolFactor")!;
  }

  get impactPoolAmount(): bigint {
    return this.eventData.getUintItem("impactPoolAmount")!;
  }

  get marketTokensSupply(): bigint {
    return this.eventData.getUintItem("marketTokensSupply")!;
  }

  get poolValue(): bigint {
    return this.eventData.getIntItem("poolValue")!;
  }

  get longPnl(): bigint {
    return this.eventData.getIntItem("longPnl")!;
  }

  get shortPnl(): bigint {
    return this.eventData.getIntItem("shortPnl")!;
  }

  get netPnl(): bigint {
    return this.eventData.getIntItem("netPnl")!;
  }

  get actionType(): string {
    return this.eventData.getBytes32Item("actionType")!;
  }

  get tradeKey(): string {
    return this.eventData.getBytes32Item("tradeKey")!;
  }
}
