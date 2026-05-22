import { matchesTextFilter } from "../../shared/filtering";
import type { DeliveryRecord } from "../../shared/models";
import type { AssetMapVesselRecord } from "../reference-data/tabs/AssetMapPanel";

function isValidCoordinateValue(
  value: number | null,
  minimum: number,
  maximum: number,
): value is number {
  return value !== null && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function buildVesselMapRecord(
  delivery: DeliveryRecord,
): AssetMapVesselRecord | null {
  if (delivery.transport_mode !== "VESSEL" || !delivery.vessel_detail) {
    return null;
  }

  const detail = delivery.vessel_detail;
  if (
    !isValidCoordinateValue(detail.last_latitude, -90, 90) ||
    !isValidCoordinateValue(detail.last_longitude, -180, 180)
  ) {
    return null;
  }

  const health = delivery.vessel_tracking_health ?? detail.tracking_health;
  const label =
    detail.vessel_name?.trim() ||
    detail.imo_number?.trim() ||
    detail.mmsi_number?.trim() ||
    delivery.delivery_id;

  return {
    deliveryId: delivery.delivery_id,
    tradeId: delivery.trade_id,
    label,
    vesselName: detail.vessel_name,
    imoNumber: detail.imo_number,
    mmsiNumber: detail.mmsi_number,
    commodity: delivery.commodity,
    status: delivery.status,
    latitude: detail.last_latitude,
    longitude: detail.last_longitude,
    lastPositionAt: detail.last_position_at,
    lastSignalAt: detail.last_signal_at,
    speedKnots: detail.last_speed_knots,
    courseDegrees: detail.last_course_degrees,
    headingDegrees: detail.last_heading_degrees,
    navigationalStatus: detail.last_navigational_status,
    destination: detail.current_destination,
    etaAtDestination: detail.current_eta_at_destination,
    healthSeverity: health?.exception_severity ?? "UNKNOWN",
    primaryException: health?.primary_exception ?? null,
  };
}

export function buildVesselMapRecords(
  deliveries: readonly DeliveryRecord[],
): AssetMapVesselRecord[] {
  return deliveries
    .map((delivery) => buildVesselMapRecord(delivery))
    .filter((record): record is AssetMapVesselRecord => record !== null);
}

export function matchesMapVesselFilter(
  vessel: AssetMapVesselRecord,
  query: string,
): boolean {
  return matchesTextFilter(query, [
    vessel.deliveryId,
    vessel.tradeId,
    vessel.label,
    vessel.vesselName,
    vessel.imoNumber,
    vessel.mmsiNumber,
    vessel.commodity,
    vessel.status,
    vessel.latitude,
    vessel.longitude,
    vessel.speedKnots,
    vessel.courseDegrees,
    vessel.headingDegrees,
    vessel.navigationalStatus,
    vessel.destination,
    vessel.etaAtDestination,
    vessel.healthSeverity,
    vessel.primaryException,
    "VESSEL",
  ]);
}
