// Add an approved HTTPS JSON adoption feed URL here when one is available.
// The feed must allow browser requests (CORS) and return an array, or an
// object with a pets array. Listings may include name, type, description,
// image, adoptionUrl, and centre: { name, latitude, longitude }.
const ADOPTION_FEED_URL = '';

const locationButton = document.querySelector('[data-location-button]');
const locationMessage = document.querySelector('[data-location-message]');
const spcaLocationButton = document.querySelector('[data-spca-location-button]');
const spcaLocationMessage = document.querySelector('[data-spca-location]');
const feedStatus = document.querySelector('[data-feed-status]');
const feedMessage = document.querySelector('[data-feed-message]');
const petGrid = document.querySelector('[data-pet-grid]');

let currentPosition = null;
let livePets = null;

function setMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.dataset.state = isError ? 'error' : 'success';
}

function isInNewZealand(latitude, longitude) {
  // Approximate geographic check; some offshore islands may fall outside it.
  return latitude < -33.5 && latitude > -47.5 && longitude > 165 && longitude < 180;
}

function requestLocation(output, onSuccess) {
  if (!navigator.geolocation) {
    setMessage(output, 'Location is not available in this browser.', true);
    return;
  }

  setMessage(output, 'Checking your location…');
  navigator.geolocation.getCurrentPosition(
    (position) => onSuccess(position.coords),
    () => setMessage(output, 'We couldn’t access your location. You can still browse without it.', true), {
      timeout: 10000,
      maximumAge: 300000
    }
  );
}

locationButton.addEventListener('click', () => {
  requestLocation(locationMessage, ({
    latitude,
    longitude
  }) => {
    if (isInNewZealand(latitude, longitude)) {
      setMessage(locationMessage, 'You appear to be in New Zealand. Explore the adoption section for a local cause.');
      document.querySelector('[data-nz-recommendation]').scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    } else {
      setMessage(locationMessage, 'You appear to be outside New Zealand. You can still explore all causes.');
    }
  });
});

spcaLocationButton.addEventListener('click', () => {
  requestLocation(spcaLocationMessage, ({
    latitude,
    longitude
  }) => {
    if (!isInNewZealand(latitude, longitude)) {
      currentPosition = null;
      setMessage(spcaLocationMessage, 'You appear to be outside New Zealand. Nearby NZ centre matching is unavailable.');
    } else {
      currentPosition = {
        latitude,
        longitude
      };
      setMessage(spcaLocationMessage, 'Location received. Centre matching is available when the feed includes centre coordinates.');
    }
    if (livePets) showPets();
  });
});

function safeHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

function centreFor(pet) {
  const centre = pet.centre || pet.center;
  if (!centre || typeof centre !== 'object') return null;
  const {
    latitude,
    longitude
  } = centre;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    latitude,
    longitude,
    name: typeof centre.name === 'string' && centre.name.trim() ? centre.name : 'Nearest centre'
  };
}

function distanceKm(a, b) {
  const radians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * radians;
  const dLon = (b.longitude - a.longitude) * radians;
  const value = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

function renderPets(pets) {
  petGrid.replaceChildren();
  pets.slice(0, 24).forEach((pet) => {
    const card = document.createElement('article');
    card.className = 'pet-card';
    const art = document.createElement('div');
    art.className = 'pet-art';
    const imageUrl = safeHttpsUrl(pet.image);
    if (imageUrl) {
      const image = document.createElement('img');
      image.src = imageUrl;
      image.alt = '';
      image.loading = 'lazy';
      art.append(image);
    } else {
      art.textContent = '♡';
      art.setAttribute('aria-hidden', 'true');
    }

    const info = document.createElement('div');
    info.className = 'pet-info';
    const title = document.createElement('h3');
    title.textContent = typeof pet.name === 'string' && pet.name.trim() ? pet.name : 'Adoption listing';
    const description = document.createElement('p');
    description.textContent = typeof pet.description === 'string' && pet.description.trim() ?
      pet.description : 'Contact the listing source for details.';
    info.append(title, description);

    if (typeof pet.type === 'string' && pet.type.trim()) {
      const tag = document.createElement('span');
      tag.className = 'pet-tag';
      tag.textContent = pet.type;
      info.append(tag);
    }

    const adoptionUrl = safeHttpsUrl(pet.adoptionUrl);
    if (adoptionUrl) {
      const link = document.createElement('a');
      link.className = 'text-link';
      link.href = adoptionUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View adoption details ↗';
      info.append(link);
    }

    card.append(art, info);
    petGrid.append(card);
  });
}

function showPets() {
  if (!livePets) return;
  if (!livePets.length) {
    renderPets([]);
    setMessage(feedMessage, 'There are no listings in the connected feed right now.');
    return;
  }

  if (!currentPosition) {
    renderPets(livePets);
    setMessage(feedMessage, `Showing up to 24 of ${livePets.length} listings. Share your location to find the nearest centre when coordinates are available.`);
    return;
  }

  const centres = livePets.map(centreFor).filter(Boolean);
  if (!centres.length) {
    renderPets(livePets);
    setMessage(feedMessage, 'The feed has no centre coordinates, so all available listings are shown instead.');
    return;
  }

  const nearest = centres.reduce((best, centre) =>
    distanceKm(currentPosition, centre) < distanceKm(currentPosition, best) ? centre : best
  );
  const matches = livePets.filter((pet) => {
    const centre = centreFor(pet);
    return centre && centre.latitude === nearest.latitude && centre.longitude === nearest.longitude;
  });
  renderPets(matches);
  setMessage(spcaLocationMessage, `${nearest.name} is the nearest centre represented in the feed. Confirm availability with the listing source.`);
  setMessage(feedMessage, `Showing up to 24 of ${matches.length} listings from ${nearest.name}.`);
}

async function loadFeed(value) {
  const endpoint = safeHttpsUrl(value);
  if (!endpoint) {
    setMessage(feedMessage, 'The configured feed URL must be a valid HTTPS address.', true);
    return;
  }

  setMessage(feedMessage, 'Loading adoption listings…');
  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: 'application/json'
      }
    });
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}.`);
    const data = await response.json();
    const pets = Array.isArray(data) ? data : data?.pets;
    if (!Array.isArray(pets)) throw new Error('Expected a JSON array or an object with a pets array.');
    livePets = pets.filter((pet) => pet && typeof pet === 'object' && !Array.isArray(pet));
    feedStatus.textContent = 'Feed connected';
    showPets();
  } catch (error) {
    feedStatus.textContent = 'Feed unavailable';
    setMessage(feedMessage, 'Live listings are currently unavailable. Please try again later.', true);
    console.error('Could not load adoption feed:', error);
  }
}

if (ADOPTION_FEED_URL) loadFeed(ADOPTION_FEED_URL);
