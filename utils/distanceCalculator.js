const axios = require('axios');

class DistanceCalculator {
  constructor() {
    this.googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.baseTransportCost = {
      '0-5km': { rate: 50, minCharge: 100 },
      '5-10km': { rate: 75, minCharge: 200 },
      '10-20km': { rate: 100, minCharge: 350 },
      '20km+': { rate: 150, minCharge: 500 }
    };
  }

  // Calculate distance using Google Maps Distance Matrix API
  async calculateDistanceGoogle(origin, destination) {
    if (!this.googleMapsApiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/distancematrix/json',
        {
          params: {
            origins: `${origin.latitude},${origin.longitude}`,
            destinations: `${destination.latitude},${destination.longitude}`,
            units: 'metric',
            mode: 'driving',
            key: this.googleMapsApiKey
          },
          timeout: 10000
        }
      );

      if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
        const element = response.data.rows[0].elements[0];
        return {
          distance: element.distance.value / 1000, // Convert to km
          duration: element.duration.value / 60, // Convert to minutes
          source: 'google',
          success: true
        };
      }

      throw new Error('Google Maps API returned invalid response');
    } catch (error) {
      console.warn('Google Maps API failed:', error.message);
      // Fallback to Haversine formula
      return this.calculateDistanceHaversine(origin, destination);
    }
  }

  // Fallback: Haversine formula for direct distance calculation
  calculateDistanceHaversine(origin, destination) {
    const R = 6371; // Earth's radius in kilometers

    const lat1Rad = (origin.latitude * Math.PI) / 180;
    const lat2Rad = (destination.latitude * Math.PI) / 180;
    const deltaLatRad = ((destination.latitude - origin.latitude) * Math.PI) / 180;
    const deltaLngRad = ((destination.longitude - origin.longitude) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    // Estimate driving time (assuming average 40 km/h in urban areas)
    const estimatedDuration = (distance / 40) * 60;

    return {
      distance: parseFloat(distance.toFixed(2)),
      duration: Math.round(estimatedDuration),
      source: 'haversine',
      success: true
    };
  }

  // Get distance zone for pricing
  getDistanceZone(distance) {
    if (distance <= 5) return '0-5km';
    if (distance <= 10) return '5-10km';
    if (distance <= 20) return '10-20km';
    return '20km+';
  }

  // Calculate transport cost based on distance and weight
  calculateTransportCost(distance, totalWeight = 1) {
    const zone = this.getDistanceZone(distance);
    const zoneConfig = this.baseTransportCost[zone];

    // Base cost calculation
    let baseCost = Math.max(
      distance * zoneConfig.rate,
      zoneConfig.minCharge
    );

    // Weight adjustment (every 100kg adds 20% to transport cost)
    const weightMultiplier = 1 + Math.floor(totalWeight / 100) * 0.2;
    baseCost *= weightMultiplier;

    // Round to nearest rupee
    return Math.round(baseCost);
  }

  // Get delivery time estimate
  getDeliveryEstimate(distance, zone = 'urban') {
    const baseHours = zone === 'rural' ? 2 : 1; // Rural areas need more time
    
    if (distance <= 5) return { min: baseHours, max: baseHours + 2 };
    if (distance <= 10) return { min: baseHours + 1, max: baseHours + 4 };
    if (distance <= 20) return { min: baseHours + 2, max: baseHours + 6 };
    return { min: baseHours + 4, max: baseHours + 8 };
  }

  // Calculate consolidated delivery for multiple suppliers
  async calculateConsolidatedDelivery(suppliers, customerLocation) {
    const deliveryCalculations = [];

    for (const supplier of suppliers) {
      const distance = await this.calculateDistanceGoogle(
        supplier.location,
        customerLocation
      );

      const transportCost = this.calculateTransportCost(
        distance.distance,
        supplier.totalWeight || 0
      );

      const deliveryEstimate = this.getDeliveryEstimate(
        distance.distance,
        supplier.zone
      );

      deliveryCalculations.push({
        supplierId: supplier.id,
        supplierName: supplier.name,
        distance: distance.distance,
        duration: distance.duration,
        transportCost,
        deliveryEstimate,
        zone: this.getDistanceZone(distance.distance),
        items: supplier.items || []
      });
    }

    // Sort by distance (closest first)
    deliveryCalculations.sort((a, b) => a.distance - b.distance);

    // Calculate potential savings for consolidated delivery
    const totalIndividualCost = deliveryCalculations.reduce(
      (sum, calc) => sum + calc.transportCost, 0
    );

    const consolidatedCost = Math.round(totalIndividualCost * 0.85); // 15% discount

    return {
      individual: deliveryCalculations,
      consolidated: {
        totalCost: consolidatedCost,
        savings: totalIndividualCost - consolidatedCost,
        recommendConsolidation: deliveryCalculations.length > 1 && 
          (totalIndividualCost - consolidatedCost) > 50
      }
    };
  }
}

module.exports = new DistanceCalculator();