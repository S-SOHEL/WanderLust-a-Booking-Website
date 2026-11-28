(() => {
  if (typeof mapboxgl === "undefined") return;

  function escapeHtml(str) {
    return String(str || "").replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  const token = typeof mapToken !== "undefined" && mapToken ? mapToken : "";
  const mapContainer = document.getElementById("map");

  if (!mapContainer) return;

  const safeTitle = escapeHtml(typeof listing !== "undefined" && listing ? listing.title || "Listing Location" : "Listing Location");
  const safeLocation = escapeHtml(typeof listing !== "undefined" && listing ? listing.location || "" : "");
  const safeCountry = escapeHtml(typeof listing !== "undefined" && listing ? listing.country || "" : "");

  if (!token || token.trim() === "" || token === "undefined") {
    mapContainer.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light text-muted p-4 text-center rounded-4 border">
        <i class="fa-solid fa-map-location-dot fs-1 mb-2 text-secondary"></i>
        <p class="mb-1 fw-semibold text-dark">Map Preview</p>
        <p class="small mb-0 text-muted">To enable live Mapbox tiles, set MAP_TOKEN in your environment.</p>
        <small class="text-secondary mt-1">${safeLocation}${safeCountry ? ", " + safeCountry : ""}</small>
      </div>`;
    return;
  }

  // Extract valid [longitude, latitude] GeoJSON pair without misleading fallback
  const hasValidCoords =
    typeof listing !== "undefined" &&
    listing &&
    listing.geometry &&
    Array.isArray(listing.geometry.coordinates) &&
    listing.geometry.coordinates.length === 2 &&
    !isNaN(Number(listing.geometry.coordinates[0])) &&
    !isNaN(Number(listing.geometry.coordinates[1])) &&
    (Number(listing.geometry.coordinates[0]) !== 0 || Number(listing.geometry.coordinates[1]) !== 0);

  if (!hasValidCoords) {
    mapContainer.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light text-muted p-4 text-center rounded-4 border">
        <i class="fa-solid fa-location-crosshairs fs-1 mb-2 text-secondary"></i>
        <p class="mb-1 fw-semibold text-dark">Location Coordinates Pending</p>
        <p class="small mb-0 text-muted">Precise geographical coordinates have not yet been pinpointed for this property.</p>
        <small class="text-secondary mt-1">${safeLocation}${safeCountry ? ", " + safeCountry : ""}</small>
      </div>`;
    return;
  }

  const coordinates = [
    Number(listing.geometry.coordinates[0]),
    Number(listing.geometry.coordinates[1]),
  ];

  const isApproximate = listing.remediationReviewStatus === "EXEMPT_REGIONAL";

  function renderFallbackMap(notice) {
    const lng = coordinates[0];
    const lat = coordinates[1];
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lat + "," + lng)}`;
    const staticMapUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/pin-s+fe424d(${lng},${lat})/${lng},${lat},12,0/800x400?access_token=${encodeURIComponent(token)}`;

    mapContainer.innerHTML = `
      <div class="position-relative w-100 h-100 rounded-4 overflow-hidden border bg-light d-flex flex-column" style="min-height: 380px;">
        <div class="position-relative flex-grow-1" style="min-height: 280px; background: #e9ecef;">
          <img src="${staticMapUrl}"
               alt="Map of ${safeLocation || safeTitle}"
               class="w-100 h-100 object-fit-cover d-block"
               onerror="this.style.display='none'; document.getElementById('mapStaticPlaceholder').classList.remove('d-none');" />
          <div id="mapStaticPlaceholder" class="d-none d-flex flex-column align-items-center justify-content-center w-100 h-100 p-4 text-center">
            <i class="fa-solid fa-map-location-dot fs-1 text-danger mb-2"></i>
            <h6 class="fw-bold mb-1">${safeLocation || safeTitle}</h6>
            <p class="small text-muted mb-0 font-monospace">${lat.toFixed(4)}° N, ${lng.toFixed(4)}° E</p>
          </div>
          <div class="position-absolute top-0 start-0 m-3 px-3 py-1 bg-white bg-opacity-90 rounded-pill shadow-sm small border d-flex align-items-center gap-1">
            <i class="fa-solid fa-map-pin text-danger"></i>
            <span class="fw-semibold text-dark text-truncate" style="max-width: 220px;">${safeLocation}${safeCountry ? ", " + safeCountry : ""}</span>
          </div>
        </div>
        <div class="p-3 bg-white border-top d-flex flex-wrap justify-content-between align-items-center gap-2">
          <small class="text-muted d-flex align-items-center gap-1">
            <i class="fa-solid fa-circle-info text-secondary"></i>
            <span>${notice || (isApproximate ? "Approximate regional location" : "Coordinates verified")}</span>
          </small>
          <div class="d-flex align-items-center gap-2">
            <button type="button" id="retryInteractiveMapBtn" class="btn btn-sm btn-outline-secondary rounded-pill px-3">
              <i class="fa-solid fa-rotate-right me-1"></i>Interactive Map
            </button>
            <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-danger rounded-pill px-3">
              <i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Open Google Maps
            </a>
          </div>
        </div>
      </div>
    `;

    const retryBtn = document.getElementById("retryInteractiveMapBtn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        retryBtn.disabled = true;
        retryBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Loading...';
        initMap();
      });
    }
  }

  function initMap() {
    // Teardown existing instance cleanly to prevent WebGL context leaks
    if (window.wanderlustMap && typeof window.wanderlustMap.remove === "function") {
      try {
        window.wanderlustMap.remove();
      } catch (e) {
        console.warn("Notice during map teardown:", e);
      }
      window.wanderlustMap = null;
    }

    // Check WebGL availability
    if (typeof mapboxgl.supported === "function" && !mapboxgl.supported({ failIfMajorPerformanceCaveat: false })) {
      renderFallbackMap("Interactive 3D view unavailable on this device; static map active");
      return;
    }

    try {
      mapboxgl.accessToken = token;

      // Clear container and initialize interactive map
      mapContainer.innerHTML = "";

      const map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/streets-v12",
        center: coordinates,
        zoom: isApproximate ? 8 : 12,
        scrollZoom: false,
      });

      window.wanderlustMap = map;

      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

      const popupSubtext = isApproximate
        ? "Approximate regional area shown; exact address provided after booking"
        : "Exact location provided after booking confirmation";

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: true }).setHTML(`
        <div style="padding: 8px 10px; font-family: inherit;">
          <h6 style="font-weight: 700; font-size: 14px; margin-bottom: 2px; color: #222;">${safeTitle}</h6>
          <p style="margin: 0; color: #717171; font-size: 12px;"><i class="fa-solid fa-location-dot" style="color: #fe424d; margin-right: 4px;"></i>${safeLocation}${safeCountry ? ", " + safeCountry : ""}</p>
          <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee; font-size: 11px; color: #555;">
            ${popupSubtext}
          </div>
        </div>
      `);

      const marker = new mapboxgl.Marker({ color: "#fe424d", scale: 1.1 })
        .setLngLat(coordinates)
        .setPopup(popup)
        .addTo(map);

      const supportsHover =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(hover: hover) and (pointer: fine)").matches;

      if (supportsHover) {
        const markerDiv = marker.getElement();
        markerDiv.addEventListener("mouseenter", () => {
          if (!popup.isOpen()) marker.togglePopup();
        });
        markerDiv.addEventListener("mouseleave", () => {
          if (popup.isOpen()) marker.togglePopup();
        });
      }

      map.on("load", () => {
        map.resize();
      });

      window.addEventListener("resize", () => {
        if (window.wanderlustMap && typeof window.wanderlustMap.resize === "function") {
          window.wanderlustMap.resize();
        }
      });

      map.on("error", (e) => {
        console.warn("Mapbox render notice:", e);
      });
    } catch (err) {
      console.warn("Mapbox initialization error, falling back to static map:", err);
      renderFallbackMap("Interactive map unavailable; static preview active");
    }
  }

  initMap();
})();
