const axios = require('axios');

class GeocodingService {
  constructor() {
    this.googleApiKey = process.env.GOOGLE_MAPS_API_KEY;
  }

  /**
   * Get coordinates from address using Google Maps API
   */
  async getCoordinates(addressInput) {
    if (!this.googleApiKey) {
      console.log('⚠️ Google Maps API key not found, using fallback coordinates');
      return this.getCityFallback(addressInput);
    }

    try {
      // Build address string
      let addressString;
      if (typeof addressInput === 'string') {
        addressString = addressInput + ', India';
      } else {
        const { address, city, state, pincode } = addressInput;
        addressString = `${address}, ${city}, ${state} ${pincode || ''}, India`.replace(/\s+/g, ' ').trim();
      }

      console.log('🌍 Geocoding:', addressString);

      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: addressString,
          key: this.googleApiKey,
          region: 'IN',
          components: 'country:IN'
        },
        timeout: 10000
      });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const result = response.data.results[0];
        const location = result.geometry.location;
        
        console.log('✅ Geocoded successfully:', location);
        
        return {
          latitude: location.lat,
          longitude: location.lng,
          formattedAddress: result.formatted_address,
          source: 'google'
        };
      } else {
        console.log('⚠️ Google geocoding failed, using fallback');
        return this.getCityFallback(addressInput);
      }
    } catch (error) {
      console.log('❌ Geocoding API error:', error.message);
      return this.getCityFallback(addressInput);
    }
  }

  /**
   * Get fallback coordinates for major Indian cities
   */
  getCityFallback(addressInput) {
    console.log('📍 Using city fallback coordinates');
    
    const cityCoordinates = {
      'mumbai': { latitude: 19.0760, longitude: 72.8777 },
      'delhi': { latitude: 28.7041, longitude: 77.1025 },
      'bangalore': { latitude: 12.9716, longitude: 77.5946 },
      'hyderabad': { latitude: 17.3850, longitude: 78.4867 },
      'ahmedabad': { latitude: 23.0225, longitude: 72.5714 },
      'chennai': { latitude: 13.0827, longitude: 80.2707 },
      'kolkata': { latitude: 22.5726, longitude: 88.3639 },
      'pune': { latitude: 18.5204, longitude: 73.8567 },
      'jaipur': { latitude: 26.9124, longitude: 75.7873 },
      'lucknow': { latitude: 26.8467, longitude: 80.9462 },
      'kanpur': { latitude: 26.4499, longitude: 80.3319 },
      'nagpur': { latitude: 21.1458, longitude: 79.0882 },
      'indore': { latitude: 22.7196, longitude: 75.8577 },
      'bhopal': { latitude: 23.2599, longitude: 77.4126 },
      'visakhapatnam': { latitude: 17.6868, longitude: 83.2185 },
      'patna': { latitude: 25.5941, longitude: 85.1376 },
      'vadodara': { latitude: 22.3072, longitude: 73.1812 },
      'ghaziabad': { latitude: 28.6692, longitude: 77.4538 },
      'ludhiana': { latitude: 30.9010, longitude: 75.8573 },
      'balasore': { latitude: 21.4942, longitude: 86.9336 },
      'bhubaneswar': { latitude: 20.2961, longitude: 85.8245 },
      'cuttack': { latitude: 20.4625, longitude: 85.8828 },
      'rourkela': { latitude: 22.2604, longitude: 84.8536 },
      'berhampur': { latitude: 19.3149, longitude: 84.7941 },
      'jeypore': { latitude: 18.8564, longitude: 82.5711 },
      'balangir': { latitude: 20.7061, longitude: 83.4862 },
      'kakinada': { latitude: 16.9891, longitude: 82.2475 },
      'uppada': { latitude: 17.0881, longitude: 82.0953 }
    };

    let city = '';
    if (typeof addressInput === 'string') {
      city = addressInput.toLowerCase();
    } else if (addressInput.city) {
      city = addressInput.city.toLowerCase();
    }

    // Find matching city
    for (const [cityName, coords] of Object.entries(cityCoordinates)) {
      if (city.includes(cityName)) {
        console.log(`📍 Using ${cityName} coordinates:`, coords);
        return {
          ...coords,
          source: 'fallback',
          formattedAddress: `${cityName.charAt(0).toUpperCase() + cityName.slice(1)}, India`
        };
      }
    }

    // Default to Bhubaneswar if no match found
    console.log('📍 Using default Bhubaneswar coordinates');
    return {
      latitude: 20.2961,
      longitude: 85.8245,
      source: 'default',
      formattedAddress: 'Bhubaneswar, Odisha, India'
    };
  }

  /**
   * Validate coordinates
   */
  validateCoordinates(latitude, longitude) {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      latitude >= -90 && latitude <= 90 &&
      longitude >= -180 && longitude <= 180 &&
      !isNaN(latitude) && !isNaN(longitude)
    );
  }
}

module.exports = new GeocodingService();