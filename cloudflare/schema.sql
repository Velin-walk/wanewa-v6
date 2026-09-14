-- Walk Nepal Walk - Cloudflare D1 Database Schema Setup
-- Run this in Cloudflare D1 Console for: walk-nepal-walk-db

-- 1. Treks Table
CREATE TABLE IF NOT EXISTS treks (
    id TEXT PRIMARY KEY,
    hike_number TEXT UNIQUE,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'Overnight Bus Hikes',
    status TEXT DEFAULT 'published',
    cover_image_url TEXT,
    hike_date TEXT,
    min_price REAL DEFAULT 0,
    max_price REAL DEFAULT 0,
    currency TEXT DEFAULT 'NPR',
    meeting_point TEXT,
    meeting_time TEXT,
    expected_duration TEXT,
    difficulty TEXT,
    approx_distance TEXT,
    elevation_range TEXT,
    elevation_gross TEXT,
    ending_point TEXT,
    team_leader TEXT,
    whatsapp_link TEXT,
    itinerary_link TEXT,
    faq_link TEXT,
    max_capacity INTEGER DEFAULT 25,
    data_json TEXT,
    author_email TEXT DEFAULT 'walknepalwalk@gmail.com',
    registered_pax INTEGER DEFAULT 0,
    available_slots INTEGER DEFAULT 25,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Registrations Table
CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hike_number TEXT,
    trek_name TEXT,
    full_name TEXT NOT NULL,
    email_address TEXT,
    phone TEXT,
    whatsapp_number TEXT,
    emergency_backup_contact TEXT,
    profession TEXT,
    part_of_group TEXT DEFAULT 'Solo',
    pax INTEGER DEFAULT 1,
    age_group TEXT,
    gender TEXT,
    fitness TEXT,
    medical_condition TEXT DEFAULT 'No',
    recent_hikes TEXT,
    agreement TEXT DEFAULT 'Yes',
    suggestions TEXT,
    guide_mode TEXT DEFAULT 'Guided',
    transport_mode TEXT DEFAULT 'Bus',
    distance TEXT,
    difficulty TEXT,
    season TEXT,
    type_of_trail TEXT,
    person_remarks TEXT,
    updates TEXT,
    due TEXT,
    paid TEXT,
    list_name TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Feedbacks Table
CREATE TABLE IF NOT EXISTS feedbacks (
    id TEXT PRIMARY KEY,
    hike_number TEXT,
    trek_name TEXT,
    full_name TEXT,
    email_address TEXT,
    team_rating INTEGER DEFAULT 5,
    team_feedback TEXT,
    overall_rating INTEGER DEFAULT 5,
    overall_feedback TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Community Trails Table (MapMiners GPX/KML routes)
CREATE TABLE IF NOT EXISTS community_trails (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    file_name TEXT UNIQUE NOT NULL,
    fileName TEXT,
    category TEXT DEFAULT 'Community Trail',
    file_size INTEGER DEFAULT 0,
    fileSize INTEGER DEFAULT 0,
    distance TEXT,
    elevation_gain TEXT,
    elevationGain TEXT,
    contributor_email TEXT,
    contributorEmail TEXT,
    status TEXT DEFAULT 'approved',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
