import React, {useRef, useEffect, useState} from 'react';
import mapboxgl from 'mapbox-gl';
import type GeoJSON from 'geojson';
import format from "date-fns/format"
import isValid from "date-fns/isValid"

import './App.css';

mapboxgl.accessToken = 'pk.eyJ1IjoiZW50dXIiLCJhIjoiY2o3dDF5ZWlrNGoyNjJxbWpscTlnMDJ2MiJ9.WLaC_f_uxaD1FLyZEjuchA';

const LNG = 10.745;
const LAT = 59.909;
const ZOOM = 9

const API_URL = "https://otp2debug.dev.entur.org/otp/traveltime/isochrone"

type IsochroneData = { time: number }
type IsochroneGeoJSON = GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, IsochroneData>

async function fetchIsochrones([lng, lat]: [number, number], time: Date, ...cutoffs: string[]): Promise<IsochroneGeoJSON> {
    const params = new URLSearchParams();
    params.set("location", `${lat},${lng}`);
    params.set("time", time.toISOString());
    for (const cutoff of cutoffs) {
        params.append("cutoff", cutoff.trim());
    }
    const res = await fetch(`${API_URL}?${params}`)
    return res.json();
}

function formatLocalTime(date: Date): string {
    return format(date, "yyyy-MM-dd'T'HH:mm")
}

function App() {
    const mapContainer = useRef<HTMLDivElement | null>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const marker = useRef<mapboxgl.Marker | null>(null);
    const [coordinates, setCoordinates] = useState<[number, number]>([LNG, LAT]);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [cutoffs, setCutoffs] = useState("15m,30m");
    const [isochrones, setIsochrones] = useState<IsochroneGeoJSON>({type: "FeatureCollection", features: []});
    const isUpdating = useRef(false);

    useEffect(() => {
        if (!mapContainer.current || map.current) return; // initialize map only once
        map.current = new mapboxgl.Map({
            container: mapContainer.current,
            style: 'mapbox://styles/entur/cl32qnjg9000i14qjgf141erd',
            center: [LNG, LAT],
            zoom: ZOOM
        });

        // @ts-ignore
        window.map = map.current;

        map.current.on('load', (e) => {
            e.target.addSource("isochrones", {
                type: "geojson",
                data: isochrones,
            });

            e.target.addLayer({
                id: "isochrones",
                type: "fill",
                source: "isochrones",
                paint: {
                    "fill-color": "#00c",
                    "fill-opacity": 0.2
                }
            }, "admin-0-boundary-disputed")
        });

        map.current.addControl(new mapboxgl.ScaleControl({maxWidth: 250}));

        marker.current = new mapboxgl.Marker({draggable: true}).setLngLat(coordinates).addTo(map.current);

        marker.current.on('dragend', () => {
            if (marker.current) {
                let lng = Number(marker.current.getLngLat().lng.toFixed(4));
                let lat = Number(marker.current.getLngLat().lat.toFixed(4));
                setCoordinates([lng, lat]);
            }
        });
    });

    useEffect(() => {
        if (isUpdating.current) return;
        isUpdating.current = true;
        fetchIsochrones(coordinates, currentTime, ...cutoffs.split(","))
            .then(newIsochrones => setIsochrones(newIsochrones))
            .catch((e: unknown) => console.error(e))
            .then(() => {
                isUpdating.current = false;
            });
    }, [coordinates, currentTime, cutoffs]);

    useEffect(() => {
        const source = map.current!.getSource("isochrones");
        if (source != null && source.type === "geojson") {
            source.setData(isochrones);
        }
    }, [isochrones]);

    return (
        <div className="App">
            <div className="sidebar">
                Longitude: {coordinates[0]} |
                Latitude: {coordinates[1]} |
                Time: {<input value={formatLocalTime(currentTime)} onChange={e => {
                    const newDate =new Date(e.target.value)
                    if (isValid(newDate)) {
                        setCurrentTime(newDate)
                    }
            }} type="datetime-local"/>} |
                Cutoffs: {<input defaultValue={cutoffs} onBlur={e => setCutoffs(e.target.value)}/>}
            </div>
            <div ref={mapContainer} className="map-container"/>
        </div>
    );
}

export default App;
