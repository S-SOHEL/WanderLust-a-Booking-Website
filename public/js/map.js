

    mapboxgl.accessToken = mapToken;

    const map = new mapboxgl.Map({  
        container: 'map',
        style: 'mapbox://styles/mapbox/standard', // Use the standard style for the map
        projection: 'globe', // display the map as a globe
        zoom: 10, // initial zoom level, 0 is the world view, higher values zoom in
        center: listing.geometry.coordinates, // center the map on this longitude and latitude
    });

    // map.addControl(new mapboxgl.NavigationControl());
    // map.scrollZoom.disable();

    // map.on('style.load', () => {
    //     map.setFog({}); // Set the default atmosphere style
    // });
     
    const marker = new mapboxgl.Marker({ color: "red" })
    .setLngLat(listing.geometry.coordinates)  //Listing Gemometry.cordinates
    .setPopup(new mapboxgl.Popup({offset: 25 })
    .setHTML('<h4>${listing.location}</h4><p>$ Exact Location will be  Provided After Booking </p>')
    .setMaxWidth("300px"))
    .addTo(map);
    