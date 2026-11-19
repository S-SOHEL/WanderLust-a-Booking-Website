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

  try {
    mapboxgl.accessToken = token;

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

    // Initialize map with universal streets style
    const map = new mapboxgl.Map({
      container: "map",
      style: "mapbox://styles/mapbox/streets-v12",
      center: coordinates,
      zoom: isApproximate ? 8 : 12,
      scrollZoom: false, // Prevent accidental scroll hijacking while browsing page
    });

    // Expose map instance cleanly for fullscreen toggle resize
    window.wanderlustMap = map;

    // Add navigation controls (zoom in / zoom out / compass)
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

    // Use hover open/close only on fine-pointer desktop devices; mobile relies on native tap toggle
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

    // Ensure full render after container stabilizes & on mobile orientation change
    map.on("load", () => {
      map.resize();
    });

    window.addEventListener("resize", () => {
      map.resize();
    });

    map.on("error", (e) => {
      console.warn("Mapbox render notice:", e);
    });
  } catch (err) {
    console.error("Mapbox initialization error:", err);
    mapContainer.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light text-muted p-4 text-center rounded-4 border">
        <p class="mb-0 text-secondary"><i class="fa-solid fa-circle-info me-1"></i>Map is temporarily unavailable for ${
          typeof listing !== "undefined" && listing ? listing.location || "this property" : "this property"
        }.</p>
      </div>`;
  }
})();