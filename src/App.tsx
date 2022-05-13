import React, {useRef, useEffect, useState, useCallback, useMemo} from 'react';
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

const debounce = (callback: Function, wait: number) => {
    let timeoutId: number | null = null;
    return (...args: any) => {
        if (timeoutId) {
            window.clearTimeout(timeoutId);
        }
      
        timeoutId = window.setTimeout(() => {
            callback.apply(null, args);
        }, wait);
    };
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

    const [features, setFeatures] = useState<any>(null);

    const searchPlaces = useCallback(async (searchString: string) => {
        const response = await fetch(`https://api.dev.entur.io/geocoder/v1/autocomplete?text=${searchString}`);
        const data = await response.json();
        setFeatures(data.features);
    }, [setFeatures]);

    const debouncedSearchPlaces = useMemo(
        () => debounce(searchPlaces, 300)
    , [searchPlaces]);

    const [selectedFeature, setSelectedFeature] = useState<any>(null);
    
    const selectPlace = useCallback((id: string) => {
        const feature = features.find((f: any) => f.properties.id === id);
        setSelectedFeature(
            feature
        );

        setCoordinates(feature.geometry.coordinates);
        map.current?.setCenter(feature.geometry.coordinates);
        marker.current?.setLngLat(feature.geometry.coordinates);
    }, [features, setSelectedFeature]);

    const reset = useCallback(() => {
        setSelectedFeature(null);
        setFeatures(null);
        setTimeout(() => {
            document.getElementById('autocomplete')?.focus();
        });
    }, []);

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
                Cutoffs: {<input defaultValue={cutoffs} onBlur={e => setCutoffs(e.target.value)}/>}  |
                Find place: {!features && !selectedFeature  && (
                    <input id="autocomplete" onChange={e => debouncedSearchPlaces(e.target.value)}/>
                )}
                {selectedFeature && (
                    <input defaultValue={selectedFeature?.properties?.name || ''} onClick={() => reset()}/>
                )}
                {features && !selectedFeature && (
                    <select value={selectedFeature?.properties?.name || '---Select place---'} onChange={(e) => selectPlace(e.target.value)}>
                        <option disabled>---Select place---</option>
                        {features.map((f: any) => (
                            <option key={f.properties.id } value={f.properties.id}>{f?.properties?.name}</option>
                        ))}
                    </select>
                )}
            </div>
            <div ref={mapContainer} className="map-container"/>
        </div>
    );
}

export default App;
