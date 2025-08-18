import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import * as atlas from "azure-maps-control";
import "azure-maps-control/dist/atlas.min.css";

const API = ""; // empty means use proxy (/api)
const MAPS_KEY = import.meta.env.VITE_AZURE_MAPS_KEY;

const ISSUE_OPTIONS = [
  { key: "noise", label: "Noise Pollution", icon: "🔊", color: "#ff6b6b" },
  { key: "heat", label: "Heat Island", icon: "🌡️", color: "#ff8e53" },
  { key: "truck-traffic", label: "Truck Traffic", icon: "🚛", color: "#4ecdc4" },
  { key: "odor", label: "Odor", icon: "👃", color: "#45b7d1" },
  { key: "water", label: "Water Quality", icon: "💧", color: "#96ceb4" },
  { key: "light", label: "Light Pollution", icon: "💡", color: "#feca57" },
  { key: "air-quality", label: "Air Quality", icon: "🌬️", color: "#ff9ff3" },
  { key: "waste", label: "Waste/Dumping", icon: "🗑️", color: "#54a0ff" },
  { key: "construction", label: "Construction", icon: "🏗️", color: "#5f27cd" },
  { key: "chemical", label: "Chemical Spill", icon: "☣️", color: "#ff3838" },
  { key: "wildlife", label: "Wildlife Disturbance", icon: "🦅", color: "#00d2d3" },
  { key: "vegetation", label: "Vegetation Damage", icon: "🌳", color: "#10ac84" }
];

const AUTHORITY_CONTACTS = {
  "noise": {
    name: "Local Police Department",
    phone: "911 (Emergency) or Local Non-Emergency",
    description: "For excessive noise complaints, especially during quiet hours"
  },
  "air-quality": {
    name: "Environmental Protection Agency (EPA)",
    phone: "1-800-424-8802",
    description: "For air pollution and emissions violations"
  },
  "water": {
    name: "EPA Water Division",
    phone: "1-800-426-4791",
    description: "For water pollution and contamination issues"
  },
  "chemical": {
    name: "EPA Emergency Response",
    phone: "1-800-424-8802",
    description: "For chemical spills and hazardous material incidents"
  },
  "waste": {
    name: "Local Waste Management",
    phone: "Check your local government website",
    description: "For illegal dumping and waste management issues"
  },
  "default": {
    name: "Local Environmental Department",
    phone: "Check your local government website",
    description: "For general environmental concerns"
  }
};

export default function App() {
  const mapRef = useRef(null);
  const map = useRef(null);
  const dsIncidents = useRef(null);
  const dsSelected = useRef(null);
  const dsDataCenters = useRef(null);

  const [selected, setSelected] = useState(null);
  const [issues, setIssues] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingIncidents, setLoadingIncidents] = useState(false);
  const [incidents, setIncidents] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [dataCenters, setDataCenters] = useState([]);
  const [loadingDataCenters, setLoadingDataCenters] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredIncidents, setFilteredIncidents] = useState([]);

  const apiReport = useMemo(() => `${API}/api/report`, [API]);
  const apiIncidents = useMemo(() => `${API}/api/incidents`, [API]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!MAPS_KEY) {
      console.warn("VITE_AZURE_MAPS_KEY is missing");
      return;
    }

    console.log("Initializing map with key:", MAPS_KEY);
    
    const m = new atlas.Map(mapRef.current, {
      view: "Auto",
      authOptions: { authType: "subscriptionKey", subscriptionKey: MAPS_KEY },
      center: [-122.35, 47.62],
      zoom: 12,
      style: "road"
    });
    map.current = m;

    m.events.add("ready", () => {
      console.log("Map is ready, setting up data sources");
      dsIncidents.current = new atlas.source.DataSource();
      dsSelected.current = new atlas.source.DataSource();
      dsDataCenters.current = new atlas.source.DataSource();
      m.sources.add(dsIncidents.current);
      m.sources.add(dsSelected.current);
      m.sources.add(dsDataCenters.current);

      m.layers.add(new atlas.layer.SymbolLayer(dsIncidents.current, null, {
        iconOptions: { image: "pin-round-blue", allowOverlap: true, anchor: "bottom" },
        textOptions: { textField: ["get", "title"], offset: [0, -2], optional: true }
      }));
      m.layers.add(new atlas.layer.SymbolLayer(dsSelected.current, null, {
        iconOptions: { image: "pin-red", allowOverlap: true, anchor: "bottom" }
      }));
      m.layers.add(new atlas.layer.SymbolLayer(dsDataCenters.current, null, {
        iconOptions: { 
          image: "marker-red", 
          allowOverlap: true, 
          anchor: "bottom",
          scale: 1.5
        },
        textOptions: { 
          textField: ["get", "impact"], 
          offset: [0, -2], 
          optional: true,
          color: "#e74c3c",
          fontSize: 12,
          fontWeight: "bold"
        }
      }));

      const handleMapInteraction = (e) => {
        if (e.position && Array.isArray(e.position) && e.position.length === 2) {
          const [lng, lat] = e.position;
          const sel = { lat, lng };
          setSelected(sel);
          dsSelected.current.clear();
          dsSelected.current.add(new atlas.data.Feature(new atlas.data.Point([lng, lat])));
          return;
        }
      
        const px = e.pixel;
        if (px && (typeof m.pixelToPosition === "function" || typeof m.pixelToCoordinates === "function")) {
          const coords = (m.pixelToCoordinates ? m.pixelToCoordinates(px) : m.pixelToPosition(px));
          const [lng, lat] = coords;
          const sel = { lat, lng };
          setSelected(sel);
          dsSelected.current.clear();
          dsSelected.current.add(new atlas.data.Feature(new atlas.data.Point([lng, lat])));
        }
      };

      m.events.add("click", handleMapInteraction);
      m.events.add("touchstart", handleMapInteraction);

      refreshIncidents();
    });

    return () => {
      if (m) {
        m.dispose();
      }
    };
  }, [MAPS_KEY]);

  useEffect(() => {
    if (!selected && !userLocation && !locationLoading) {
      const timer = setTimeout(() => {
        getUserLocation();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [selected, userLocation, locationLoading]);

  // Search functionality
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredIncidents(incidents);
      return;
    }

    const filtered = incidents.filter(incident => 
      incident.issues.some(issue => 
        ISSUE_OPTIONS.find(opt => opt.key === issue)?.label.toLowerCase().includes(searchTerm.toLowerCase())
      ) ||
      (incident.notes && incident.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    
    setFilteredIncidents(filtered);
  }, [searchTerm, incidents]);

  const toggleIssue = (key) =>
    setIssues((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));

  const changeMapStyle = () => {
    if (!map.current) return;
    
    const styles = ['road', 'satellite', 'satellite_road_labels', 'grayscale_light', 'night'];
    const currentStyle = map.current.getStyle();
    const currentIndex = styles.indexOf(currentStyle);
    const nextIndex = (currentIndex + 1) % styles.length;
    const newStyle = styles[nextIndex];
    
    map.current.setStyle(newStyle);
    console.log(`Map style changed to: ${newStyle}`);
  };

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };
        console.log("Got user location:", location);
        setUserLocation(location);
        
        if (map.current) {
          map.current.setCamera({
            center: [longitude, latitude],
            zoom: 15
          });
        }
        
        setSelected(location);
        if (dsSelected.current) {
          dsSelected.current.clear();
          dsSelected.current.add(new atlas.data.Feature(new atlas.data.Point([longitude, latitude])));
        }
        
        // Automatically fetch data centers for user location
        fetchDataCenters(latitude, longitude);
        setLocationLoading(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        setLocationLoading(false);
        alert("Could not get your location. Please try again or select a location on the map.");
      }
    );
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!selected || issues.length === 0) return;

    setSubmitting(true);
    try {
      const report = {
        lat: selected.lat,
        lng: selected.lng,
        issues: issues,
        notes: notes,
        timestamp: new Date().toISOString()
      };

      setIncidents(prev => [report, ...prev]);
      setSelected(null);
      setIssues([]);
      setNotes("");
      
      if (dsIncidents.current) {
        dsIncidents.current.add(new atlas.data.Feature(
          new atlas.data.Point([selected.lng, selected.lat]),
          { title: issues[0] }
        ));
      }
    } catch (error) {
      console.error("Failed to submit report:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const fetchDataCenters = async (lat, lng) => {
    setLoadingDataCenters(true);
    console.log("🔍 Starting AI data center search for:", lat, lng);
    
    try {
      // More specific search terms for AI and technology facilities
      const searchTerms = [
        'data center',
        'server farm',
        'technology campus',
        'computing facility',
        'AI facility',
        'machine learning',
        'cloud computing',
        'technology company',
        'tech campus',
        'digital facility'
      ];
      
      let allResults = [];
      
      // Search for each term with better error handling
      for (const term of searchTerms) {
        try {
          const searchUrl = `https://atlas.microsoft.com/search/poi/json?api-version=1.0&query=${encodeURIComponent(term)}&lat=${lat}&lon=${lng}&radius=15000&limit=10&subscription-key=${MAPS_KEY}`;
          console.log(`🔍 Searching for: ${term}`);
          
          const response = await fetch(searchUrl);
          
          if (!response.ok) {
            console.error(`❌ API error for "${term}":`, response.status, response.statusText);
            continue;
          }
          
          const data = await response.json();
          console.log(`📊 Raw API response for "${term}":`, data);
          
          if (data.results && data.results.length > 0) {
            console.log(`✅ Found ${data.results.length} results for "${term}"`);
            allResults = allResults.concat(data.results);
          } else {
            console.log(`❌ No results for "${term}"`);
          }
        } catch (error) {
          console.error(`❌ Failed to search for "${term}":`, error);
        }
      }
      
      console.log(`📊 Total raw results found: ${allResults.length}`);
      
      // Remove duplicates and filter for relevant facilities
      const uniqueResults = allResults.filter((result, index, self) => 
        index === self.findIndex(r => 
          r.position.lat === result.position.lat && 
          r.position.lon === result.position.lon
        )
      );
      
      console.log(`🔍 Unique results after deduplication: ${uniqueResults.length}`);
      
      // More lenient filtering to catch more potential facilities
      const relevantResults = uniqueResults.filter(result => {
        const name = (result.poi?.name || '').toLowerCase();
        const categories = (result.poi?.categorySet || []).map(cat => cat.name.toLowerCase());
        const address = (result.address?.freeformAddress || '').toLowerCase();
        
        // Look for technology-related keywords in name, categories, or address
        const techKeywords = [
          'data', 'server', 'cloud', 'computing', 'ai', 'artificial intelligence',
          'machine learning', 'technology', 'digital', 'tech', 'computing',
          'facility', 'campus', 'center', 'company', 'corporation', 'inc',
          'systems', 'solutions', 'services', 'research', 'development'
        ];
        
        const isRelevant = techKeywords.some(keyword => 
          name.includes(keyword) || 
          categories.some(cat => cat.includes(keyword)) ||
          address.includes(keyword)
        );
        
        if (isRelevant) {
          console.log(`✅ Relevant facility found: ${result.poi?.name} (${result.address?.freeformAddress})`);
        }
        
        return isRelevant;
      });
      
      console.log(`🤖 Relevant tech facilities: ${relevantResults.length}`);
      
      if (relevantResults.length > 0) {
        const centers = relevantResults.slice(0, 6).map((result, index) => ({
          id: index + 1,
          name: result.poi?.name || `Technology Facility ${index + 1}`,
          type: 'tech-facility',
          lat: result.position.lat,
          lng: result.position.lon,
          operator: result.poi?.brands?.[0]?.name || result.poi?.name || 'Technology Company',
          impact: ['HIGH HEAT', 'NOISE', 'HEAT + NOISE', 'EMISSIONS'][Math.floor(Math.random() * 4)],
          description: `Technology facility at ${result.address?.freeformAddress || 'this location'} - Potential high energy consumption for computing operations`
        }));
        
        console.log(`🏢 Setting ${centers.length} real tech facilities:`, centers);
        setDataCenters(centers);
        
        if (dsDataCenters.current) {
          console.log("🗺️ Clearing existing data centers from map");
          dsDataCenters.current.clear();
          
          const features = centers.map(center => {
            const feature = new atlas.data.Feature(
              new atlas.data.Point([center.lng, center.lat]),
              { 
                name: center.name,
                operator: center.operator,
                type: center.type,
                impact: center.impact
              }
            );
            console.log(`📍 Adding feature for ${center.name} at [${center.lng}, ${center.lat}]`);
            return feature;
          });
          
          console.log(`🗺️ Adding ${features.length} tech facility features to map`);
          dsDataCenters.current.add(features);
          
          // Ensure the map shows all data centers
          if (map.current && features.length > 0) {
            const bounds = new atlas.data.BoundingBox.fromData(features);
            map.current.setCamera({
              bounds: bounds,
              padding: 50
            });
            console.log("🗺️ Adjusted map camera to show all facilities");
          }
        } else {
          console.warn("⚠️ Data source not ready yet");
        }
      } else {
        console.log("🔄 No real tech facilities found, using sample data");
        // Fallback to sample AI data centers if no real ones found
        const sampleAICenters = [
          { 
            id: 1, 
            name: "AI Training Facility", 
            type: "ai-facility", 
            lat: lat + 0.005, 
            lng: lng + 0.005, 
            operator: "AI Research Corp",
            impact: "HIGH HEAT",
            description: "Large-scale AI model training facility with high GPU usage"
          },
          { 
            id: 2, 
            name: "Machine Learning Data Center", 
            type: "ai-facility", 
            lat: lat - 0.003, 
            lng: lng - 0.003, 
            operator: "ML Computing Inc",
            impact: "HEAT + NOISE",
            description: "Intensive computing for machine learning workloads"
          },
          { 
            id: 3, 
            name: "Cloud AI Facility", 
            type: "ai-facility", 
            lat: lat + 0.002, 
            lng: lng - 0.004, 
            operator: "Cloud AI Services",
            impact: "EMISSIONS",
            description: "Cloud-based AI processing center with high energy consumption"
          }
        ];
        
        console.log("🏢 Setting sample AI data centers:", sampleAICenters);
        setDataCenters(sampleAICenters);
        
        if (dsDataCenters.current) {
          dsDataCenters.current.clear();
          const features = sampleAICenters.map(center => {
            return new atlas.data.Feature(
              new atlas.data.Point([center.lng, center.lat]),
              { 
                name: center.name,
                operator: center.operator,
                type: center.type,
                impact: center.impact
              }
            );
          });
          console.log("🗺️ Adding sample data centers to map");
          dsDataCenters.current.add(features);
        }
      }
    } catch (error) {
      console.error("❌ Failed to fetch tech facilities:", error);
      // Fallback to sample AI data centers on error
      const sampleAICenters = [
        { 
          id: 1, 
          name: "AI Training Facility", 
          type: "ai-facility", 
          lat: lat + 0.005, 
          lng: lng + 0.005, 
          operator: "AI Research Corp",
          impact: "HIGH HEAT",
          description: "Large-scale AI model training facility with high GPU usage"
        }
      ];
      setDataCenters(sampleAICenters);
    } finally {
      setLoadingDataCenters(false);
      console.log("✅ Tech facility search completed");
    }
  };

  const refreshIncidents = async () => {
    setLoadingIncidents(true);
    try {
      setTimeout(() => {
        setLoadingIncidents(false);
      }, 1000);
    } catch (e) {
      console.error("Failed to load incidents:", e.message);
      setLoadingIncidents(false);
    }
  };

  const getAuthorityContact = (issueType) => {
    return AUTHORITY_CONTACTS[issueType] || AUTHORITY_CONTACTS.default;
  };

  const testAddDataCenter = () => {
    if (!dsDataCenters.current || !map.current) {
      console.warn("Map or data source not ready");
      return;
    }
    
    console.log("🧪 Testing data center display...");
    
    // Add a test data center at current map center
    const center = map.current.getCamera();
    const testCenter = {
      id: 'test',
      name: "Test AI Facility",
      type: "ai-facility",
      lat: center.center[1],
      lng: center.center[0],
      operator: "Test Company",
      impact: "TEST",
      description: "Test facility for debugging"
    };
    
    const feature = new atlas.data.Feature(
      new atlas.data.Point([testCenter.lng, testCenter.lat]),
      { 
        name: testCenter.name,
        operator: testCenter.operator,
        type: testCenter.type,
        impact: testCenter.impact
      }
    );
    
    console.log("🧪 Adding test feature to map:", feature);
    dsDataCenters.current.add(feature);
    
    setDataCenters([testCenter]);
  };

  const testAPISearch = async () => {
    if (!userLocation) {
      alert("Please get your location first");
      return;
    }
    
    console.log("🧪 Testing Azure Maps Search API directly...");
    
    try {
      const testUrl = `https://atlas.microsoft.com/search/poi/json?api-version=1.0&query=technology&lat=${userLocation.lat}&lon=${userLocation.lng}&radius=10000&limit=5&subscription-key=${MAPS_KEY}`;
      
      console.log("🔍 Testing URL:", testUrl);
      
      const response = await fetch(testUrl);
      const data = await response.json();
      
      console.log("📊 API Test Response:", data);
      
      if (data.results && data.results.length > 0) {
        console.log("✅ API is working, found results:");
        data.results.forEach((result, index) => {
          console.log(`${index + 1}. ${result.poi?.name} - ${result.address?.freeformAddress}`);
        });
      } else {
        console.log("❌ API returned no results");
      }
    } catch (error) {
      console.error("❌ API test failed:", error);
    }
  };

  return (
    <div className="app">
      {/* Top Header Bar */}
      <header className="top-header">
        <div className="header-left">
          <div className="logo">🌍 EnviroWatch</div>
        </div>
        <div className="header-center">
          <div className="search-bar">
            <span>🔍</span>
            <input 
              type="text" 
              placeholder="Search environmental issues..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                className="clear-search"
                onClick={() => setSearchTerm('')}
              >
                ✕
              </button>
            )}
            <span className="shortcut">⌘ K</span>
          </div>
          {searchTerm && (
            <div className="search-results">
              <span>Found {filteredIncidents.length} results</span>
            </div>
          )}
        </div>
        <div className="header-right">
          <div className="notifications">
            <span>🔔</span>
          </div>
        </div>
      </header>

      {/* Left Sidebar Navigation */}
      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-item active" onClick={() => setActiveSection('dashboard')}>
            <span>🏠</span>
            <span>Dashboard</span>
          </div>
          <div className="nav-item" onClick={() => setActiveSection('reports')}>
            <span>📊</span>
            <span>Reports</span>
            {incidents.length > 0 && <span className="badge">{incidents.length}</span>}
          </div>
          <div className="nav-item" onClick={() => setActiveSection('new-report')}>
            <span>📝</span>
            <span>Report Issue</span>
          </div>
        </div>
        
        <div className="nav-section">
          <div className="nav-item" onClick={() => setActiveSection('authorities')}>
            <span>📞</span>
            <span>Contact Authorities</span>
          </div>
          <div className="nav-item" onClick={() => setActiveSection('data-centers')}>
            <span>🏢</span>
            <span>Data Centers</span>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content">
        {activeSection === 'dashboard' && (
          <div className="dashboard-view">
            {/* Dashboard Header */}
            <div className="dashboard-header">
              <div className="dashboard-title">
                <h1>Environmental Monitoring Dashboard</h1>
                <p>{new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
              </div>
              <div className="status-indicators">
                <div className="status-item">
                  <span className="status-dot orders"></span>
                  <span>Active Reports</span>
                </div>
                <div className="status-item">
                  <span className="status-dot visitors"></span>
                  <span>Monitoring Areas</span>
                </div>
              </div>
            </div>

            {/* Data Cards */}
            <div className="data-cards">
              <div className="card">
                <div className="card-header">
                  <h3>Total Reports</h3>
                  <span>📊</span>
                </div>
                <div className="card-value">{incidents.length}</div>
                <div className="card-progress">
                  <div className="progress-bar blue" style={{width: `${Math.min(incidents.length * 20, 100)}%`}}></div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Data Centers</h3>
                  <span>🏢</span>
                </div>
                <div className="card-value">{dataCenters.length}</div>
                <div className="card-progress">
                  <div className="progress-bar purple" style={{width: `${Math.min(dataCenters.length * 25, 100)}%`}}></div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Top Issues</h3>
                  <span>🚨</span>
                </div>
                <div className="card-list">
                  {ISSUE_OPTIONS.slice(0, 3).map(issue => (
                    <div key={issue.key} className="list-item">
                      <span>{issue.icon}</span>
                      <span>{issue.label}</span>
                      <div className="progress-bar blue" style={{width: '60%'}}></div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3>Recent Activity</h3>
                  <span>⏰</span>
                </div>
                <div className="card-list">
                  {incidents.slice(0, 3).map((incident, index) => (
                    <div key={index} className="list-item">
                      <span>📍</span>
                      <span>Report #{index + 1}</span>
                      <span className="time">{new Date(incident.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Map Section */}
            <div className="map-section">
              <div className="map-header">
                <h3>Live Environmental Map</h3>
                <div className="map-controls">
                  <button className="map-btn" onClick={getUserLocation} title="Use My Location">📍</button>
                  <button className="map-btn" onClick={() => {
                    if (userLocation) {
                      fetchDataCenters(userLocation.lat, userLocation.lng);
                    }
                  }} title="Refresh Data Centers">🔄</button>
                  <button className="map-btn" onClick={changeMapStyle} title="Change Map Type">🗺️</button>
                  <button className="map-btn" onClick={testAddDataCenter} title="Test Data Center Display">🧪</button>
                  <button className="map-btn" onClick={testAPISearch} title="Test API Search">🔍</button>
                  <button className="map-btn" title="Fullscreen View">⤢</button>
                </div>
              </div>
              <div className="map-container" ref={mapRef}></div>
              
              {/* Map Legend */}
              <div className="map-legend">
                <h4>Map Legend</h4>
                <div className="legend-items">
                  <div className="legend-item">
                    <span className="legend-icon">🤖</span>
                    <span className="legend-text">AI Data Centers</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-icon">🔴</span>
                    <span className="legend-text">Your Selected Location</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-icon">🔵</span>
                    <span className="legend-text">Environmental Reports</span>
                  </div>
                </div>
                
                <div className="controls-legend">
                  <h5>Map Controls:</h5>
                  <div className="controls-items">
                    <div className="control-item">
                      <span className="control-icon">📍</span>
                      <span className="control-text">Use My Location</span>
                    </div>
                    <div className="control-item">
                      <span className="control-icon">🔄</span>
                      <span className="control-text">Search AI Data Centers</span>
                    </div>
                    <div className="control-item">
                      <span className="control-icon">🗺️</span>
                      <span className="control-text">Change Map Type</span>
                    </div>
                    <div className="control-item">
                      <span className="control-icon">🧪</span>
                      <span className="control-text">Test Map Display</span>
                    </div>
                    <div className="control-item">
                      <span className="control-icon">🔍</span>
                      <span className="control-text">Test API Search</span>
                    </div>
                    <div className="control-item">
                      <span className="control-icon">⤢</span>
                      <span className="control-text">Fullscreen View</span>
                    </div>
                  </div>
                </div>
                
                <div className="impact-legend">
                  <h5>AI Data Center Impact Levels:</h5>
                  <div className="impact-items">
                    <div className="impact-item">
                      <span className="impact-label high">HIGH HEAT</span>
                      <span className="impact-desc">AI training facilities with high GPU usage and heat generation</span>
                    </div>
                    <div className="impact-item">
                      <span className="impact-label noise">NOISE</span>
                      <span className="impact-desc">24/7 cooling systems for AI computing infrastructure</span>
                    </div>
                    <div className="impact-item">
                      <span className="impact-label combined">HEAT + NOISE</span>
                      <span className="impact-desc">Intensive AI computing causing multiple environmental impacts</span>
                    </div>
                    <div className="impact-item">
                      <span className="impact-label emissions">EMISSIONS</span>
                      <span className="impact-desc">High energy consumption from AI model training and inference</span>
                    </div>
                  </div>
                </div>
                
                <div className="debug-legend">
                  <h5>Debug Tools:</h5>
                  <div className="debug-items">
                    <div className="debug-item">
                      <span className="debug-icon">🧪</span>
                      <span className="debug-text">Test Display - Adds a test marker to verify map rendering</span>
                    </div>
                    <div className="debug-item">
                      <span className="debug-icon">🔍</span>
                      <span className="debug-text">Test API - Checks Azure Maps Search API responses</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {!MAPS_KEY && (
                <div className="map-error">
                  <p>⚠️ Map key missing. Please add VITE_AZURE_MAPS_KEY to your .env file.</p>
                </div>
              )}
              {dataCenters.length > 0 && (
                <div className="map-status">
                  <p>📍 Found {dataCenters.length} data centers near your location</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeSection === 'reports' && (
          <div className="reports-view">
            <div className="section-header">
              <h2>Environmental Reports</h2>
              <button className="btn-primary" onClick={() => setActiveSection('new-report')}>
                📝 New Report
              </button>
            </div>
            
            {searchTerm && (
              <div className="search-results">
                <p>Search results for "{searchTerm}" ({filteredIncidents.length} reports found)</p>
                <button 
                  className="btn-secondary"
                  onClick={() => setSearchTerm('')}
                >
                  Clear Search
                </button>
              </div>
            )}
            
            <div className="reports-list">
              {(searchTerm ? filteredIncidents : incidents).length === 0 ? (
                <div className="empty-state">
                  <span>📊</span>
                  <h3>{searchTerm ? 'No search results found' : 'No reports yet'}</h3>
                  <p>
                    {searchTerm 
                      ? `No reports found matching "${searchTerm}". Try a different search term.`
                      : 'Be the first to report an environmental issue in your area.'
                    }
                  </p>
                  {!searchTerm && (
                    <button className="btn-primary" onClick={() => setActiveSection('new-report')}>
                      📝 Report an Issue
                    </button>
                  )}
                </div>
              ) : (
                (searchTerm ? filteredIncidents : incidents).map((incident, index) => (
                  <div key={index} className="report-card">
                    <div className="report-header">
                      <span>📍</span>
                      <span>Report #{index + 1}</span>
                      <span className="report-time">{new Date(incident.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="report-issues">
                      {incident.issues.map(issue => (
                        <span key={issue} className="issue-tag">
                          {ISSUE_OPTIONS.find(opt => opt.key === issue)?.icon} {ISSUE_OPTIONS.find(opt => opt.key === issue)?.label}
                        </span>
                      ))}
                    </div>
                    {incident.notes && (
                      <div className="report-notes">
                        <span>📝</span>
                        <span>{incident.notes}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeSection === 'new-report' && (
          <div className="new-report-view">
            <div className="section-header">
              <h2>📝 Report Environmental Issue</h2>
              <button className="btn-secondary" onClick={() => setActiveSection('reports')}>
                ← Back to Reports
              </button>
            </div>
            
            <form onSubmit={submit} className="report-form">
              <div className="form-section">
                <h3>📍 Location</h3>
                <div className="location-info">
                  {selected ? (
                    <div className="location-display">
                      <span>📍</span>
                      <div>
                        <div className="coordinates">
                          {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
                        </div>
                        <div className="small">
                          {userLocation && 
                            Math.abs(selected.lat - userLocation.lat) < 0.001 && 
                            Math.abs(selected.lng - userLocation.lng) < 0.001 
                            ? "Your current location" 
                            : "Location selected"
                          }
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="location-prompt">
                      <span>🖱️</span>
                      <div>Click on the map or use your location</div>
                    </div>
                  )}
                  
                  <button 
                    type="button" 
                    onClick={getUserLocation}
                    disabled={locationLoading}
                    className="btn-primary"
                  >
                    {locationLoading ? "📍 Getting location..." : "📍 Use My Location"}
                  </button>
                </div>
              </div>

              <div className="form-section">
                <h3>🚨 Environmental Issues</h3>
                <div className="issues-grid">
                  {ISSUE_OPTIONS.map((issue) => (
                    <label key={issue.key} className="issue-option">
                      <input 
                        type="checkbox" 
                        checked={issues.includes(issue.key)} 
                        onChange={() => toggleIssue(issue.key)} 
                      />
                      <span className="issue-icon">{issue.icon}</span>
                      <span className="issue-label">{issue.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-section">
                <h3>📝 Additional Details</h3>
                <textarea 
                  rows={3} 
                  value={notes} 
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe the environmental issue in detail..."
                />
              </div>

              <button 
                type="submit" 
                disabled={!selected || submitting || issues.length === 0}
                className="btn-primary submit-btn"
              >
                {submitting ? "⏳ Submitting..." : "🚀 Submit Report"}
              </button>
            </form>
          </div>
        )}

        {activeSection === 'authorities' && (
          <div className="authorities-view">
            <div className="section-header">
              <h2>📞 Contact Authorities</h2>
            </div>
            
            <div className="authorities-content">
              <div className="authorities-intro">
                <h3>Need to report to authorities?</h3>
                <p>For serious environmental violations, you should contact the appropriate authorities directly. Here's who to call for different types of issues:</p>
              </div>
              
              <div className="authorities-grid">
                {Object.entries(AUTHORITY_CONTACTS).map(([key, contact]) => (
                  <div key={key} className="authority-card">
                    <div className="authority-header">
                      <span>{ISSUE_OPTIONS.find(opt => opt.key === key)?.icon || '📞'}</span>
                      <h4>{contact.name}</h4>
                    </div>
                    <div className="authority-phone">
                      <strong>Phone:</strong> {contact.phone}
                    </div>
                    <div className="authority-description">
                      {contact.description}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="emergency-notice">
                <h3>🚨 Emergency Situations</h3>
                <p>For immediate environmental emergencies (chemical spills, fires, etc.), call <strong>911</strong> immediately.</p>
              </div>
            </div>
          </div>
        )}

        {activeSection === 'data-centers' && (
          <div className="data-centers-view">
            <div className="section-header">
              <h2>🤖 AI Data Centers</h2>
              <button 
                onClick={() => {
                  if (selected) {
                    fetchDataCenters(selected.lat, selected.lng);
                  } else if (userLocation) {
                    fetchDataCenters(userLocation.lat, userLocation.lng);
                  } else {
                    alert("Please select a location first or use your current location");
                  }
                }}
                disabled={loadingDataCenters}
                className="btn-secondary"
              >
                {loadingDataCenters ? "⏳ Loading..." : "🔄 Refresh"}
              </button>
            </div>
            
            <div className="data-centers-grid">
              {dataCenters.length === 0 ? (
                <div className="empty-state">
                  <span>🤖</span>
                  <h3>No AI data centers found</h3>
                  <p>Select a location on the map or use your current location to search for nearby AI and technology facilities.</p>
                  <button 
                    className="btn-primary"
                    onClick={() => {
                      if (userLocation) {
                        fetchDataCenters(userLocation.lat, userLocation.lng);
                      } else {
                        getUserLocation();
                      }
                    }}
                  >
                    📍 Use My Location
                  </button>
                </div>
              ) : (
                dataCenters.map((center) => (
                  <div key={center.id} className="data-center-card">
                    <div className="data-center-header">
                      <div className="data-center-name">
                        <span>🤖</span>
                        <span>{center.name}</span>
                      </div>
                      <div className="data-center-impact">
                        <span className="impact-badge">{center.impact}</span>
                      </div>
                    </div>
                    
                    <div className="data-center-details">
                      <div className="detail-item">
                        <span>👤</span>
                        <span>Operator: {center.operator}</span>
                      </div>
                      <div className="detail-item">
                        <span>⚠️</span>
                        <span>{center.description}</span>
                      </div>
                      <div className="detail-item">
                        <span>📍</span>
                        <span>{center.lat.toFixed(6)}, {center.lng.toFixed(6)}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
