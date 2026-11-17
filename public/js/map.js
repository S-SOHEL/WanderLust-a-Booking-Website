if (typeof mapboxgl !== "undefined") {
  const token = typeof mapToken !== "undefined" && mapToken ? mapToken : "";
  const mapContainer = document.getElementById("map");

  if (!token || token.trim() === "" || token === "undefined") {
    if (mapContainer) {
      mapContainer.innerHTML = `
        <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light text-muted p-4 text-center rounded-4 border">
          <i class="fa-solid fa-map-location-dot fs-1 mb-2 text-secondary"></i>
          <p class="mb-1 fw-semibold text-dark">Map Preview</p>
          <p class="small mb-0 text-muted">To enable live Mapbox tiles, set MAP_TOKEN in your .env file.</p>
          <small class="text-secondary mt-1">${typeof listing !== "undefined" && listing ? listing.location + ", " + listing.country : ""}</small>
        </div>`;
    }
  } else if (mapContainer) {
    try {
      mapboxgl.accessToken = token;

      // Extract valid longitude and latitude without misleading Mumbai fallback
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
            <small class="text-secondary mt-1">${typeof listing !== "undefined" && listing ? (listing.location || "") + ", " + (listing.country || "") : ""}</small>
          </div>`;
        return;
      }

      const coordinates = [
        Number(listing.geometry.coordinates[0]),
        Number(listing.geometry.coordinates[1]),
      ];

      // Initialize map with universal streets style
      const map = new mapboxgl.Map({
        container: "map",
        style: "mapbox://styles/mapbox/streets-v12",
        center: coordinates,
        zoom: 12,
        scrollZoom: false, // Prevent accidental scrolling when browsing page
      });

      // Add navigation controls (zoom in / zoom out / compass)
      map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "top-right");

      // Custom circular pulse marker
      const marker = new mapboxgl.Marker({ color: "#fe424d", scale: 1.1 })
        .setLngLat(coordinates)
        .setPopup(
          new mapboxgl.Popup({ offset: 25, closeButton: false }).setHTML(`
            <div style="padding: 8px 10px; font-family: inherit;">
              <h6 style="font-weight: 700; font-size: 14px; margin-bottom: 2px; color: #222;">${
                listing.title || "Listing Location"
              }</h6>
              <p style="margin: 0; color: #717171; font-size: 12px;"><i class="fa-solid fa-location-dot" style="color: #fe424d; margin-right: 4px;"></i>${
                listing.location || ""
              }, ${listing.country || ""}</p>
              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #eee; font-size: 11px; color: #555;">
                Exact location provided after booking confirmation
              </div>
            </div>
          `)
        )
        .addTo(map);

      // Show popup on marker hover
      const markerDiv = marker.getElement();
      markerDiv.addEventListener("mouseenter", () => marker.togglePopup());
      markerDiv.addEventListener("mouseleave", () => marker.togglePopup());

      // Ensure full render after container stabilizes
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
        <div class="d-flex flex-column align-items-center justify-content-center h-100 bg-light text-muted p-4 text-center rounded-4">
          <p class="mb-0 text-secondary"><i class="fa-solid fa-circle-info me-1"></i>Map is loading for ${
            listing.location || "this property"
          }...</p>
        </div>`;
    }
  }
}