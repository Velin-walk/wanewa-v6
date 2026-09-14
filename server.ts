import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Trek, Booking, Invite } from './src/types';
import { DEFAULT_SAVED_HIKES, SavedHikeRecord } from './src/data/defaultItineraryTemplate';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: '15mb' }));

  // In-memory data storage (populated dynamically from Cloudflare D1)
  let treks: Trek[] = [];
  let bookings: Booking[] = [];
  let invites: Record<string, Invite> = {};
  let feedbacks: any[] = [];

  const cancelledCfBookings = new Set<string>();

  const getCfBookingKey = (fullName: string, trekName: string) => {
    return `${(fullName || '').trim().toLowerCase()}|${(trekName || '').trim().toLowerCase()}`;
  };

  let nextBookingId = 1;

  const CLOUDFLARE_WORKER_URL = (
    process.env.CLOUDFLARE_WORKER_URL ||
    'https://walk-nepal-walk-api.velinrai-vr.workers.dev'
  ).replace(/\/+$/, '');

  function convertSavedHikeToTrek(record: SavedHikeRecord): Trek {
    const data = record.data;
    const diffRaw = (data?.overview?.difficulty || 'Moderate').toLowerCase();
    const diff: 'easy' | 'moderate' | 'difficult' =
      diffRaw === 'hard' || diffRaw === 'challenging'
        ? 'difficult'
        : diffRaw === 'easy'
        ? 'easy'
        : 'moderate';

    let priceDisplay = '';
    if (data?.priceTiers && data.priceTiers.length > 0) {
      const prices = data.priceTiers.map((t) => Number(t.price) || 0).filter((p) => p > 0);
      if (prices.length > 0) {
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        priceDisplay = `${data.currency || 'NPR'} ${minP.toLocaleString()}${
          maxP !== minP ? ` - ${maxP.toLocaleString()}` : ''
        }`;
      }
    }

    return {
      id: record.id || `hike-${record.hikeNumber}`,
      hike_number: record.hikeNumber,
      name: record.title || data?.title || 'Walk Nepal Walk Hike',
      date: data?.hikeDate || 'Upcoming',
      days: data?.overview?.expectedDuration || '1 Day',
      difficulty: diff,
      leader: data?.teamLeader || 'Walk Nepal Walk Guide',
      capacity: Number(data?.maxCapacity) || 25,
      participants: 0,
      itinerary_link: data?.itineraryLink || '',
      faq_link: data?.faqLink || '',
      whatsapp_link: data?.whatsappLink || '',
      price: priceDisplay,
      featured_image:
        data?.coverImageUrl ||
        'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80',
      fitness_level: 'All fitness levels',
      season: 'Year-round',
      type_of_trail: record.category || 'Overnight Bus Hikes',
      start_location: data?.overview?.meetingPoint || 'Kathmandu, Nepal',
      elevation: data?.overview?.elevationRange || '',
      itinerary: '',
    };
  }

  function mapD1Trek(row: any): Trek {
    // Prefer data from the nested JSON object if available, as flat columns can get out of sync
    let d: any = {};
    try {
      d = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
      // Support data_json column if that's where the worker stores it
      if (!d.hikeNumber && row.data_json) {
        const dj = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : row.data_json;
        d = { ...d, ...dj };
      }
    } catch (e) {
      d = {};
    }

    const title = d.title || row.title || row.trek_name || 'Walk Nepal Walk Hike';
    const hikeNum = d.hikeNumber || row.hike_number || row.hikeNumber || '';
    const date = d.hikeDate || row.hike_date || row.date || '';
    const diffRaw = (d.overview?.difficulty || row.difficulty || 'Easy').toLowerCase();
    
    const diff: 'easy' | 'moderate' | 'difficult' =
      diffRaw === 'hard' || diffRaw === 'challenging'
        ? 'difficult'
        : diffRaw === 'moderate'
        ? 'moderate'
        : 'easy';

    let priceDisplay = row.price || "";
    const prices = (d.priceTiers || []).map((t: any) => Number(t.price) || 0).filter((p: number) => p > 0);
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      priceDisplay = max !== min 
        ? `${d.currency || 'NPR'} ${min.toLocaleString()} - ${max.toLocaleString()}`
        : `${d.currency || 'NPR'} ${min.toLocaleString()}`;
    } else if (!priceDisplay && row.min_price) {
      priceDisplay = `${row.currency || 'NPR'} ${row.min_price}${
        row.max_price && row.max_price !== row.min_price ? ` - ${row.max_price}` : ''
      }`;
    }

    return {
      id: String(row.id || hikeNum || (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      hike_number: String(hikeNum),
      name: title,
      date: date,
      days: d.overview?.expectedDuration || row.expected_duration || row.days || '1',
      difficulty: diff,
      leader: d.teamLeader || row.team_leader || row.leader || 'Walk Nepal Walk Guide',
      capacity: Number(d.maxCapacity || row.max_capacity || row.capacity) || 25,
      participants: Number(row.registered_pax || row.participants) || 0,
      itinerary_link: d.itineraryLink || row.itinerary_link || '',
      faq_link: d.faqLink || row.faq_link || '',
      whatsapp_link: d.whatsappLink || row.whatsapp_link || '',
      price: priceDisplay,
      featured_image:
        d.coverImageUrl ||
        row.cover_image_url ||
        row.featured_image ||
        row.thumbnail_url ||
        'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80',
      fitness_level: d.overview?.difficulty || 'All fitness levels',
      season: row.season || 'Autumn / Year-round',
      type_of_trail: d.category || row.category || row.type_of_trail || 'Overnight Bus Hike',
      start_location: d.overview?.meetingPoint || row.meeting_point || row.start_location || 'Kathmandu, Nepal',
      elevation: d.overview?.elevationRange || row.elevation_range || row.elevation || '',
      itinerary: row.itinerary || '',
      data: d, // Pass through original data
    };
  }

  /**
   * Enriches treks with real-time registrations directly from Cloudflare D1 + active session bookings
   */
  async function enrichTreksWithLiveParticipants(d1Treks: Trek[]): Promise<Trek[]> {
    let cfRegistrations: any[] = [];
    try {
      const regRes = await fetch(`${CLOUDFLARE_WORKER_URL}/registrations`, {
        signal: AbortSignal.timeout(5000),
      });
      if (regRes.ok) {
        const regJson = (await regRes.json()) as { success: boolean; data: any[] };
        if (regJson.success && Array.isArray(regJson.data)) {
          cfRegistrations = regJson.data;
        }
      }
    } catch (e) {
      console.warn('Could not fetch registrations from Cloudflare Worker:', e);
    }

    const mergedTreks: Trek[] = [...d1Treks];

    // Merge saved published itineraries from the Admin Builder so they immediately appear in the catalog & homepage
    const publishedSavedHikes = savedItineraries.filter((h) => h.status === 'published');
    for (const savedHike of publishedSavedHikes) {
      const hikeNum = (savedHike.hikeNumber || '').trim();
      const existingIdx = mergedTreks.findIndex(
        (t) =>
          (hikeNum && t.hike_number && t.hike_number.trim() === hikeNum) ||
          t.id === savedHike.id
      );

      const convertedTrek = convertSavedHikeToTrek(savedHike);

      if (existingIdx !== -1) {
        // Overlay richer details from the builder (e.g. fresh cover image, latest title & pricing)
        mergedTreks[existingIdx] = {
          ...mergedTreks[existingIdx],
          name: savedHike.title || mergedTreks[existingIdx].name,
          date: savedHike.data?.hikeDate || mergedTreks[existingIdx].date,
          days: savedHike.data?.overview?.expectedDuration || mergedTreks[existingIdx].days,
          price: convertedTrek.price || mergedTreks[existingIdx].price,
          featured_image: savedHike.data?.coverImageUrl || mergedTreks[existingIdx].featured_image,
          type_of_trail: savedHike.category || mergedTreks[existingIdx].type_of_trail,
          start_location: savedHike.data?.overview?.meetingPoint || mergedTreks[existingIdx].start_location,
          elevation: savedHike.data?.overview?.elevationRange || mergedTreks[existingIdx].elevation,
          leader: savedHike.data?.teamLeader || mergedTreks[existingIdx].leader,
          capacity: Number(savedHike.data?.maxCapacity) || mergedTreks[existingIdx].capacity,
          whatsapp_link: savedHike.data?.whatsappLink || mergedTreks[existingIdx].whatsapp_link,
          itinerary_link: savedHike.data?.itineraryLink || mergedTreks[existingIdx].itinerary_link,
          faq_link: savedHike.data?.faqLink || mergedTreks[existingIdx].faq_link,
        };
      } else {
        mergedTreks.unshift(convertedTrek);
      }
    }

    const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Tally live participants and rosters for each trek purely from Cloudflare registrations + local session bookings
    for (const trek of mergedTreks) {
      let totalPax = 0;
      let maleCount = 0;
      let femaleCount = 0;
      const recentList: Array<{ name: string; gender: 'm' | 'f' }> = [];

      // D1 registrations matching this trek
      const matchedD1Regs = cfRegistrations.filter((r) => {
        const hikeMatch =
          (trek.hike_number && r.hike_number && String(r.hike_number).trim() === String(trek.hike_number).trim()) ||
          (trek.id && r.hike_number && String(r.hike_number).trim() === String(trek.id).trim());
        const nameMatch =
          r.trek_name &&
          (norm(r.trek_name) === norm(trek.name) ||
            norm(trek.name).includes(norm(r.trek_name)) ||
            norm(r.trek_name).includes(norm(trek.name)));
        return Boolean(hikeMatch || nameMatch);
      });

      // In-memory bookings matching this trek
      const matchedLocalBookings = bookings.filter((b) => {
        return (
          b.trek_id === trek.id ||
          b.trek_id === trek.hike_number ||
          norm(b.trek_name) === norm(trek.name)
        );
      });

      const seenNames = new Set<string>();

      // Incorporate D1 registrations
      for (const reg of matchedD1Regs) {
        const regName = reg.full_name?.trim();
        if (regName && !seenNames.has(regName.toLowerCase())) {
          seenNames.add(regName.toLowerCase());
          const pax = Math.max(1, Number(reg.pax) || 1);
          totalPax += pax;
          const isFemale = String(reg.gender || '').toLowerCase().startsWith('f');
          if (isFemale) {
            femaleCount += 1;
            maleCount += Math.max(0, pax - 1);
          } else {
            maleCount += 1;
            femaleCount += Math.max(0, pax - 1);
          }
          recentList.push({
            name: regName,
            gender: isFemale ? 'f' : 'm',
          });
        }
      }

      // Incorporate active local session bookings
      for (const b of matchedLocalBookings) {
        const bName = b.full_name?.trim();
        if (bName && !seenNames.has(bName.toLowerCase())) {
          seenNames.add(bName.toLowerCase());
          const bPax = 1 + (Array.isArray(b.team_members) ? b.team_members.length : 0);
          totalPax += bPax;
          const isFemale = String(b.gender || '').toLowerCase().startsWith('f');
          if (isFemale) femaleCount += 1;
          else maleCount += 1;

          recentList.unshift({
            name: bName,
            gender: isFemale ? 'f' : 'm',
          });

          for (const tm of b.team_members || []) {
            if (tm.full_name && !seenNames.has(tm.full_name.toLowerCase().trim())) {
              seenNames.add(tm.full_name.toLowerCase().trim());
              const tmFemale = String(tm.gender || '').toLowerCase().startsWith('f');
              if (tmFemale) femaleCount += 1;
              else maleCount += 1;
              recentList.unshift({
                name: tm.full_name.trim(),
                gender: tmFemale ? 'f' : 'm',
              });
            }
          }
        }
      }

      trek.participants = totalPax > 0 ? totalPax : trek.participants || 0;
      trek.participants_by_gender = {
        total: trek.participants,
        male: maleCount,
        female: femaleCount,
      };
      trek.recent_participants = recentList;
    }

    return mergedTreks;
  }

  // ===== PUBLIC ROUTES =====

  let isRevalidatingTreks = false;
  async function revalidateTreks() {
    if (isRevalidatingTreks) return;
    isRevalidatingTreks = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const cacheBuster = `?t=${Date.now()}`;
      const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks${cacheBuster}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (cfRes.ok) {
        const cfJson = (await cfRes.json()) as { success: boolean; data: any[] };
        if (cfJson.success && Array.isArray(cfJson.data)) {
          const mapped = cfJson.data.map(mapD1Trek);
          const enriched = await enrichTreksWithLiveParticipants(mapped);
          treks = enriched;
          return;
        }
      }

      // If D1 returned empty or non-200, enrich purely from saved itineraries
      treks = await enrichTreksWithLiveParticipants([]);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        // Silent timeout recovery
      } else {
        console.warn('[WNW Server] Revalidation note:', err?.message || err);
      }
      // If treks is still empty, populate from saved itineraries
      if (treks.length === 0) {
        treks = await enrichTreksWithLiveParticipants([]);
      }
    } finally {
      isRevalidatingTreks = false;
    }
  }

  /**
   * GET /api/treks - Get all upcoming treks from Cloudflare D1 with live participant counts
   */
  app.get('/api/treks', async (req, res) => {
    // If cache is empty, we must wait for initial load. Otherwise, return cache instantly and revalidate in background.
    if (treks.length === 0) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7000);
        const cacheBuster = `?t=${Date.now()}`;
        const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks${cacheBuster}`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (cfRes.ok) {
          const cfJson = (await cfRes.json()) as { success: boolean; data: any[] };
          if (cfJson.success && Array.isArray(cfJson.data) && cfJson.data.length > 0) {
            const mapped = cfJson.data.map(mapD1Trek);
            treks = await enrichTreksWithLiveParticipants(mapped);
          }
        }
      } catch (err) {
        // Fall back gracefully
      }
    } else {
      // Async background revalidation
      revalidateTreks().catch(() => {});
    }

    res.json({
      success: true,
      data: treks
    });
  });

  /**
   * GET /api/treks/:trekId - Get trek details with live participant count
   */
  app.get('/api/treks/:trekId', async (req, res) => {
    const { trekId } = req.params;
    const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    let trek = treks.find(
      (t) => t.id === trekId || t.hike_number === trekId || norm(t.name) === norm(trekId)
    );

    if (!trek) {
      try {
        const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks/${encodeURIComponent(trekId)}`, {
          signal: AbortSignal.timeout(3500),
        });
        if (cfRes.ok) {
          const cfJson = (await cfRes.json()) as { success: boolean; trek: any; roster: any[]; total_pax: number };
          if (cfJson.success && cfJson.trek) {
            const mapped = mapD1Trek(cfJson.trek);
            const enriched = await enrichTreksWithLiveParticipants([mapped]);
            trek = enriched[0];
          }
        }
      } catch (err) {
        // Fallback
      }
    }

    if (!trek) {
      return res.status(404).json({ error: 'Trek not found' });
    }
    res.json(trek);
  });

  /**
   * GET /api/invites/join?code=XXX - Join trek via invite code
   */
  app.get('/api/invites/join', (req, res) => {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).json({ error: 'Invite code required' });
    }

    const invite = invites[code.toUpperCase()];
    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    invite.used_count += 1;
    const trek = treks.find((t) => t.id === invite.trek_id || t.hike_number === invite.trek_id);

    res.json({
      invite,
      trek,
      message: 'Invite code verified successfully',
    });
  });

  // ===== BOOKINGS ROUTES =====

  /**
   * GET /api/bookings - Get bookings (filtered by email if provided) from Cloudflare D1
   */
  app.get('/api/bookings', async (req, res) => {
    const email = (req.query.email as string) || '';

    let cfBookings: Booking[] = [];
    try {
      const url = email
        ? `${CLOUDFLARE_WORKER_URL}/registrations?email=${encodeURIComponent(email)}`
        : `${CLOUDFLARE_WORKER_URL}/registrations`;
      const cfRes = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (cfRes.ok) {
        const cfJson = (await cfRes.json()) as { success: boolean; data: any[] };
        if (cfJson.success && Array.isArray(cfJson.data)) {
          cfBookings = cfJson.data.map((row: any) => ({
            id: row.id,
            trek_id: String(row.hike_number || 'trek-1'),
            user_email: row.email_address || email,
            full_name: row.full_name,
            phone: row.phone,
            whatsapp: row.whatsapp_number || row.phone,
            emergency_contact: row.emergency_backup_contact,
            email: row.email_address,
            profession: row.profession,
            is_group: (row.part_of_group as 'Solo' | 'Group') || 'Solo',
            age_group: row.age_group || '20-30',
            gender: row.gender || 'Female',
            joined_at: row.timestamp || new Date().toISOString(),
            trek_name: row.trek_name,
            trek_date: row.list_name ? (row.list_name.match(/\(([^)]+)\)/)?.[1] || '') : '',
            trek_difficulty: (row.difficulty as any) || 'Moderate',
            trek_days: row.distance || 'Multi-day',
            team_members: [],
            has_medical: row.medical_condition && row.medical_condition !== 'No' ? 'Yes' : 'No',
            specify_medical: row.medical_condition !== 'No' ? row.medical_condition : '',
            recent_hikes: row.recent_hikes,
            agree_rules: row.agreement || 'Yes',
            guide_preference: row.guide_mode || 'Guided',
            transport_preference: row.transport_mode || 'Bus',
            suggestions: row.suggestions,
          }));
        }
      }
    } catch (err) {
      console.warn('Could not query Cloudflare Worker for bookings:', err);
    }

    const localBookings = email
      ? bookings.filter((b) => b.user_email.toLowerCase() === email.toLowerCase())
      : bookings;

    const combined = [...localBookings];
    for (const cfb of cfBookings) {
      const key = getCfBookingKey(cfb.full_name || '', cfb.trek_name || '');
      if (cancelledCfBookings.has(key)) {
        continue;
      }
      if (!combined.some((b) => b.full_name === cfb.full_name && b.trek_name === cfb.trek_name)) {
        combined.push(cfb);
      }
    }
    return res.json(combined);
  });

  /**
   * POST /api/bookings - Register for a trek
   */
  app.post('/api/bookings', async (req, res) => {
    try {
      const {
        trek_id,
        trek_name,
        user_email = 'velinrai.VR@gmail.com',
        full_name,
        phone,
        whatsapp,
        emergency_contact,
        email,
        profession,
        is_group,
        age_group,
        gender,
        team_members = [],
        has_medical,
        specify_medical,
        recent_hikes,
        agree_rules,
        guide_preference,
        transport_preference,
        suggestions,
      } = req.body;

    if (!trek_id || !full_name || !phone || !age_group || !gender) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const norm = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let trek = treks.find(
      (t) =>
        t.id === trek_id ||
        t.hike_number === trek_id ||
        (t.name && trek_name && norm(t.name) === norm(trek_name))
    );

    if (!trek) {
      try {
        const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks`, {
          signal: AbortSignal.timeout(4000),
        });
        if (cfRes.ok) {
          const cfJson = (await cfRes.json()) as { success: boolean; data: any[] };
          if (cfJson.success && Array.isArray(cfJson.data)) {
            const mapped = cfJson.data.map(mapD1Trek);
            treks = await enrichTreksWithLiveParticipants(mapped);
            trek = treks.find(
              (t) =>
                t.id === trek_id ||
                t.hike_number === trek_id ||
                (t.name && trek_name && norm(t.name) === norm(trek_name))
            );
          }
        }
      } catch (err) {
        console.warn('Could not warm up treks from Cloudflare Worker:', err);
      }
    }

    if (!trek) {
      return res.status(404).json({ error: 'Trek not found' });
    }

    // Check capacity
    const totalNewPeople = 1 + (Array.isArray(team_members) ? team_members.length : 0);
    const currentCount = trek.participants || 0;
    if (currentCount + totalNewPeople > trek.capacity) {
      return res.status(400).json({
        error: `Only ${trek.capacity - currentCount} spots left for this trek.`,
      });
    }

    // Create booking
    const bookingId = nextBookingId++;
    const newBooking: Booking = {
      id: bookingId,
      trek_id,
      user_email: email || user_email,
      full_name,
      phone,
      whatsapp: whatsapp || phone,
      emergency_contact,
      email: email || user_email,
      profession,
      is_group,
      age_group,
      gender,
      joined_at: new Date().toISOString(),
      trek_name: trek.name,
      trek_date: trek.date,
      trek_difficulty: trek.difficulty,
      trek_days: trek.days,
      team_members: Array.isArray(team_members) ? team_members : [],
      has_medical,
      specify_medical,
      recent_hikes,
      agree_rules,
      guide_preference,
      transport_preference,
      suggestions,
    };

    bookings.unshift(newBooking);

    // Update trek live stats
    trek.participants = (trek.participants || 0) + totalNewPeople;
    if (!trek.participants_by_gender) {
      trek.participants_by_gender = { total: 0, male: 0, female: 0 };
    }
    trek.participants_by_gender.total += totalNewPeople;

    const isMale = (g: string) => g?.toLowerCase().startsWith('m');
    const isFemale = (g: string) => g?.toLowerCase().startsWith('f');

    if (isMale(gender)) trek.participants_by_gender.male += 1;
    if (isFemale(gender)) trek.participants_by_gender.female += 1;

    for (const tm of team_members) {
      if (isMale(tm.gender)) trek.participants_by_gender.male += 1;
      if (isFemale(tm.gender)) trek.participants_by_gender.female += 1;
    }

    if (!trek.recent_participants) {
      trek.recent_participants = [];
    }
    const isGenderFemale = (g: string) => g?.toLowerCase().startsWith('f');
    trek.recent_participants.unshift({
      name: full_name,
      gender: isGenderFemale(gender) ? 'f' : 'm',
    });
    for (const tm of team_members) {
      if (tm.full_name) {
        trek.recent_participants.unshift({
          name: tm.full_name,
          gender: isGenderFemale(tm.gender) ? 'f' : 'm',
        });
      }
    }

    // Sync registration to Cloudflare D1
    let cfSynced = false;
    try {
      const primaryPayload = {
        trek_name: trek.name,
        full_name,
        pax: totalNewPeople,
        updates: '',
        due: trek.price ? `NPR ${trek.price}` : '',
        paid: '',
        whatsapp: whatsapp || phone,
        phone,
        whatsapp_number: whatsapp || phone,
        emergency_backup_contact: emergency_contact || '',
        email_address: email || user_email,
        profession: profession || '',
        pickup_point: '',
        part_of_group: is_group || (team_members.length > 0 ? 'Group' : 'Solo'),
        list_name: `${trek.name} (${trek.date})`,
        age_group,
        gender,
        fitness: trek.fitness_level || '',
        medical_condition: has_medical === 'Yes' ? (specify_medical || 'Yes') : 'No',
        recent_hikes: recent_hikes || '',
        agreement: agree_rules || 'Yes',
        suggestions: suggestions || '',
        guide_mode: guide_preference || 'Guided',
        transport_mode: transport_preference || 'Bus',
        hike_number: trek.hike_number || trek.id,
        distance: trek.distance || '',
        difficulty: trek.difficulty || '',
        season: trek.season || '',
        type_of_trail: trek.type_of_trail || '',
        person_remarks:
          team_members.length > 0
            ? `Primary contact with ${team_members.length} companion(s): ${team_members
                .map((m: any) => m.full_name)
                .join(', ')}`
            : 'Solo registration',
      };

      const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryPayload),
      });

      if (cfRes.ok) {
        cfSynced = true;
        console.log(`[Cloudflare D1] Primary registration saved successfully for ${full_name}`);
      } else {
        const errText = await cfRes.text();
        console.error(`[Cloudflare D1] Error (${cfRes.status}):`, errText);
      }

      // Also record team members in D1
      for (const tm of team_members) {
        if (tm.full_name) {
          const tmRes = await fetch(`${CLOUDFLARE_WORKER_URL}/registrations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              trek_name: trek.name,
              full_name: tm.full_name,
              pax: 1,
              updates: '',
              due: '',
              paid: '',
              whatsapp: tm.phone || '',
              phone: tm.phone || '',
              whatsapp_number: tm.phone || '',
              emergency_backup_contact: phone,
              email_address: email || user_email,
              profession: '',
              pickup_point: '',
              part_of_group: 'Group',
              list_name: `${trek.name} (${trek.date})`,
              age_group: tm.age_group || '20-30',
              gender: tm.gender || 'Female',
              fitness: trek.fitness_level || '',
              medical_condition: 'No',
              recent_hikes: '',
              agreement: 'Yes',
              suggestions: '',
              guide_mode: guide_preference || 'Guided',
              transport_mode: transport_preference || 'Bus',
              hike_number: trek.hike_number || trek.id,
              distance: trek.distance || '',
              difficulty: trek.difficulty || '',
              season: trek.season || '',
              type_of_trail: trek.type_of_trail || '',
              person_remarks: `Companion registered by ${full_name} (${phone})`,
            }),
          });
          if (!tmRes.ok) {
            console.error(`[Cloudflare D1] Error saving companion ${tm.full_name}:`, await tmRes.text());
          }
        }
      }
    } catch (cfErr) {
      console.warn('Error syncing registration to Cloudflare D1:', cfErr);
    }

    res.json({
      success: true,
      booking_id: bookingId,
      cloudflare_synced: cfSynced,
      message: 'Successfully registered for trek',
      booking: newBooking,
    });
    } catch (err: any) {
      console.error('Error handling booking registration:', err);
      res.status(500).json({ error: err.message || 'Internal server error while processing booking' });
    }
  });

  /**
   * DELETE /api/bookings/:bookingId - Cancel a booking
   */
  app.delete('/api/bookings/:bookingId', async (req, res) => {
    const bookingId = parseInt(req.params.bookingId);
    const index = bookings.findIndex((b) => b.id === bookingId);

    let removed: Booking | null = null;

    if (index !== -1) {
      removed = bookings[index];
      bookings.splice(index, 1);
    } else {
      // It's not in the local bookings list. Let's find it in the Cloudflare bookings!
      try {
        const url = `${CLOUDFLARE_WORKER_URL}/registrations`;
        const cfRes = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (cfRes.ok) {
          const cfJson = (await cfRes.json()) as { success: boolean; data: any[] };
          if (cfJson.success && Array.isArray(cfJson.data)) {
            const matchedRow = cfJson.data.find((row) => row.id === bookingId);
            if (matchedRow) {
              const key = getCfBookingKey(matchedRow.full_name || '', matchedRow.trek_name || '');
              cancelledCfBookings.add(key);

              removed = {
                id: bookingId,
                trek_id: String(matchedRow.hike_number || ''),
                user_email: matchedRow.email_address || '',
                full_name: matchedRow.full_name || '',
                phone: matchedRow.phone || '',
                whatsapp: matchedRow.whatsapp_number || matchedRow.phone || '',
                trek_name: matchedRow.trek_name || '',
                team_members: [],
                gender: matchedRow.gender || 'Female',
              } as any;
            }
          }
        }
      } catch (err) {
        console.warn('Error querying Cloudflare to cancel booking:', err);
      }
    }

    if (!removed) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update trek stats
    const trek = treks.find(
      (t) =>
        t.id === removed!.trek_id ||
        t.hike_number === removed!.trek_id ||
        (removed!.trek_name && t.name === removed!.trek_name)
    );
    if (trek) {
      const totalPeople = 1 + (removed.team_members?.length || 0);
      trek.participants = Math.max(0, (trek.participants || 0) - totalPeople);
      if (trek.participants_by_gender) {
        trek.participants_by_gender.total = Math.max(
          0,
          trek.participants_by_gender.total - totalPeople
        );
        const isFem = (g?: string) => String(g || '').toLowerCase().startsWith('f');
        if (isFem(removed.gender)) {
          trek.participants_by_gender.female = Math.max(0, trek.participants_by_gender.female - 1);
        } else {
          trek.participants_by_gender.male = Math.max(0, trek.participants_by_gender.male - 1);
        }
        for (const tm of removed.team_members || []) {
          if (isFem(tm.gender)) {
            trek.participants_by_gender.female = Math.max(0, trek.participants_by_gender.female - 1);
          } else {
            trek.participants_by_gender.male = Math.max(0, trek.participants_by_gender.male - 1);
          }
        }
      }

      if (trek.recent_participants) {
        const removedNames = new Set([
          removed.full_name?.toLowerCase().trim(),
          ...(removed.team_members?.map((m) => m.full_name?.toLowerCase().trim()) || []),
        ]);
        trek.recent_participants = trek.recent_participants.filter(
          (p) => !removedNames.has(p.name?.toLowerCase().trim())
        );
      }
    }

    res.json({ success: true, message: 'Booking canceled successfully' });
  });

  /**
   * POST /api/treks/:trekId/invite - Create invite link
   */
  app.post('/api/treks/:trekId/invite', (req, res) => {
    const { trekId } = req.params;
    const { user_email = 'velinrai.VR@gmail.com' } = req.body;

    const trek = treks.find((t) => t.id === trekId);
    if (!trek) {
      return res.status(404).json({ error: 'Trek not found' });
    }

    const code = 'WN-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    const newInvite: Invite = {
      code,
      trek_id: trekId,
      created_by: user_email,
      used_count: 0,
      created_at: new Date().toISOString(),
    };

    invites[code] = newInvite;

    res.json({
      code,
      link: `/?invite=${code}`,
    });
  });

  /**
   * POST /api/feedback - Save trek feedback
   */
  app.post('/api/feedback', async (req, res) => {
    try {
      const {
        name,
        email,
        recentWalk,
        hikeNumber,
        teamFeedback = '',
        teamRating = 5,
        overallFeedback = '',
        overallRating = 5,
      } = req.body;

      const newFeedback = {
        id: `fb_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: name || 'Anonymous Hiker',
        email: email || '',
        recentWalk: recentWalk || '',
        hikeNumber: hikeNumber || '',
        teamFeedback,
        teamRating: Number(teamRating) || 5,
        overallFeedback,
        overallRating: Number(overallRating) || 5,
        submittedAt: new Date().toISOString(),
      };

      feedbacks.unshift(newFeedback);

      // 1. Forward to Cloudflare Worker D1 endpoint
      const workerEndpoints = [
        `${CLOUDFLARE_WORKER_URL}/feedback`,
        'https://wawebcollection.velinrai-vr.workers.dev/feedback',
      ];

      for (const endpoint of workerEndpoints) {
        try {
          await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hike_number: newFeedback.hikeNumber,
              trek_name: newFeedback.recentWalk,
              full_name: newFeedback.name,
              email_address: newFeedback.email,
              team_rating: newFeedback.teamRating,
              team_feedback: newFeedback.teamFeedback,
              overall_rating: newFeedback.overallRating,
              overall_feedback: newFeedback.overallFeedback,
            }),
            signal: AbortSignal.timeout(3000),
          });
        } catch (cfErr) {
          // Continue to next endpoint or fallback
        }
      }

      // 2. Optionally forward to Google Apps Script if reachable
      try {
        const scriptUrl = 'https://script.google.com/macros/s/AKfycbzmL7jL9CH9RTIAFKsG-wZnPxCwwJbxlxAprNn6Rs1Qt4rHTSmG8uCE7qOuKMK2wNDN/exec';
        const params = new URLSearchParams({
          name: newFeedback.name,
          recentWalk: newFeedback.recentWalk,
          teamFeedback: newFeedback.teamFeedback,
          teamRating: String(newFeedback.teamRating),
          overallFeedback: newFeedback.overallFeedback,
          overallRating: String(newFeedback.overallRating),
        });

        fetch(`${scriptUrl}?${params.toString()}`, {
          method: 'POST',
          signal: AbortSignal.timeout(3000),
        }).catch(() => {});
      } catch (fwdErr) {
        // Non-blocking
      }

      res.json({
        success: true,
        message: 'Feedback submitted successfully',
        feedback: newFeedback,
      });
    } catch (err: any) {
      console.error('Error saving feedback:', err);
      res.status(500).json({ success: false, error: err.message || 'Failed to save feedback' });
    }
  });

  /**
   * GET /api/feedback - Retrieve feedbacks
   */
  app.get('/api/feedback', async (req, res) => {
    const hikeNumber = req.query.hikeNumber as string;
    try {
      const url = hikeNumber
        ? `${CLOUDFLARE_WORKER_URL}/feedback?hike_number=${encodeURIComponent(hikeNumber)}`
        : `${CLOUDFLARE_WORKER_URL}/feedback`;
      const cfRes = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (cfRes.ok) {
        const data = await cfRes.json();
        return res.json(data);
      }
    } catch (e) {
      // Fallback to local memory
    }

    if (hikeNumber) {
      return res.json(feedbacks.filter(f => f.hikeNumber === hikeNumber));
    }
    res.json(feedbacks);
  });

  /**
   * GET /api/itinerary-preview - Proxies Google Sites & Docs itineraries to bypass X-Frame-Options
   */
  app.get('/api/itinerary-preview', async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl || (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://'))) {
      return res.status(400).send('Invalid or missing URL parameter.');
    }

    try {
      let fetchUrl = targetUrl;
      // If it's a Google Doc, use clean preview mode
      if (fetchUrl.includes('docs.google.com/document/d/')) {
        fetchUrl = fetchUrl.replace(/\/edit(\?[^#]*)?/, '/preview');
      }

      const response = await fetch(fetchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(6000),
      });

      if (!response.ok) {
        return res
          .status(200)
          .send(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FAF8F5; color: #1F1F1F; text-align: center; padding: 20px; }
                .card { background: white; padding: 32px; border-radius: 16px; border: 1px solid #E5E1DB; max-width: 420px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
                h3 { margin-top: 0; font-size: 18px; color: #1F1F1F; }
                p { color: #8B8680; font-size: 14px; line-height: 1.5; }
                .btn { display: inline-block; background: #E08828; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 13px; margin-top: 16px; }
              </style>
            </head>
            <body>
              <div class="card">
                <h3>External Itinerary Document</h3>
                <p>This itinerary document is hosted externally. Click below to view the complete schedule directly in your browser.</p>
                <a class="btn" href="${targetUrl}" target="_blank" rel="noopener noreferrer">Open Itinerary Page &rarr;</a>
              </div>
            </body>
            </html>
          `);
      }

      let html = await response.text();

      // Inject base tag so all relative assets (images, fonts, stylesheets) load from source site
      const baseTag = `<base href="${fetchUrl}" target="_blank">`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else if (html.includes('<head ')) {
        html = html.replace(/<head[^>]*>/i, (m) => `${m}${baseTag}`);
      } else {
        html = baseTag + html;
      }

      // Strip meta tags that could enforce strict CSP / frame blocking
      html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
      html = html.replace(/<meta[^>]*http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

      // Remove headers that forbid iframe embedding
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300'); // Cache 5 minutes
      return res.send(html);
    } catch (err: any) {
      // Graceful fallback page if domain lookup or connection fails
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #FAF8F5; color: #1F1F1F; text-align: center; padding: 20px; }
            .card { background: white; padding: 32px; border-radius: 16px; border: 1px solid #E5E1DB; max-width: 420px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            h3 { margin-top: 0; font-size: 18px; color: #1F1F1F; }
            p { color: #8B8680; font-size: 14px; line-height: 1.5; }
            .btn { display: inline-block; background: #E08828; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: bold; font-size: 13px; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h3>External Itinerary Link</h3>
            <p>This hike route guide is hosted on an external link. Click below to view the guide.</p>
            <a class="btn" href="${targetUrl}" target="_blank" rel="noopener noreferrer">Open External Link &rarr;</a>
          </div>
        </body>
        </html>
      `);
    }
  });

  /**
   * GET /api/health
   */
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'Walk Nepal Walk Platform API',
    });
  });

  /**
   * MAPMINERS ENDPOINTS (Cloudflare-only architecture)
   */

  // GET /api/mapminers/trails - Get all trails metadata from Cloudflare D1
  app.get('/api/mapminers/trails', async (req, res) => {
    try {
      const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/mapminers/trails`, {
        signal: AbortSignal.timeout(6000),
      });
      if (cfRes.ok) {
        const cfJson = await cfRes.json();
        return res.json(cfJson);
      } else {
        const errText = await cfRes.text();
        return res.status(cfRes.status).json({ success: false, error: errText });
      }
    } catch (err: any) {
      console.error('[MapMiners] Cloudflare trails fetch error:', err);
      return res.status(500).json({ success: false, error: err.message || 'Failed to fetch trails from Cloudflare' });
    }
  });

  // GET /api/mapminers/download/:fileName - Stream GPX/KML file directly from Cloudflare R2
  app.get('/api/mapminers/download/:fileName', async (req, res) => {
    const fileName = req.params.fileName;
    const cleanFileName = path.basename(fileName);

    try {
      const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/mapminers/download/${encodeURIComponent(cleanFileName)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (cfRes.ok) {
        const content = await cfRes.text();
        res.setHeader('Content-Type', cfRes.headers.get('Content-Type') || 'text/xml');
        return res.send(content);
      } else {
        return res.status(cfRes.status).json({ error: 'Trail file not found in Cloudflare storage' });
      }
    } catch (e: any) {
      console.error('[MapMiners] Cloudflare download error:', e);
      return res.status(500).json({ error: e.message || 'Failed to download trail file' });
    }
  });

  // POST /api/mapminers/upload & POST /api/mapminers/contribute - Upload directly to Cloudflare R2 & D1
  app.post(['/api/mapminers/upload', '/api/mapminers/contribute'], async (req, res) => {
    try {
      const { fileName, fileContent, name } = req.body;

      if (!fileName || !fileContent || !name) {
        return res.status(400).json({ error: 'Missing required parameters: fileName, fileContent, or name' });
      }

      const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/mapminers/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000),
      });

      if (cfRes.ok) {
        const cfJson = await cfRes.json();
        return res.json(cfJson);
      } else {
        const errText = await cfRes.text();
        return res.status(cfRes.status).json({ error: errText || 'Failed to save trail to Cloudflare' });
      }
    } catch (err: any) {
      console.error('[MapMiners] Cloudflare upload error:', err);
      return res.status(500).json({ error: err.message || 'Failed to upload trail to Cloudflare' });
    }
  });

  // ===== ITINERARY & TREK LIBRARY API =====
  let itinerariesFilePath = path.join(process.cwd(), 'data', 'itineraries.json');
  const fallbackFilePath = path.join('/tmp', 'itineraries.json');

  function loadSavedItineraries(): SavedHikeRecord[] {
    try {
      // 1. Try reading from the /tmp/itineraries.json fallback first if it exists
      if (fs.existsSync(fallbackFilePath)) {
        const raw = fs.readFileSync(fallbackFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          itinerariesFilePath = fallbackFilePath;
          console.log('[Itineraries] Loaded active database from fallback path:', fallbackFilePath);
          return parsed;
        }
      }

      // 2. Try standard workspace path
      if (fs.existsSync(itinerariesFilePath)) {
        const raw = fs.readFileSync(itinerariesFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[Itineraries] Failed reading itineraries.json, falling back to default hikes:', e);
    }
    return DEFAULT_SAVED_HIKES;
  }

  function saveItinerariesToDisk(records: SavedHikeRecord[]) {
    try {
      const dir = path.dirname(itinerariesFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(itinerariesFilePath, JSON.stringify(records, null, 2), 'utf-8');
    } catch (e) {
      console.error(`[Itineraries] Failed saving to primary path (${itinerariesFilePath}). Retrying fallback...`, e);
      try {
        itinerariesFilePath = fallbackFilePath;
        fs.writeFileSync(itinerariesFilePath, JSON.stringify(records, null, 2), 'utf-8');
        console.log(`[Itineraries] Successfully saved to fallback path: ${fallbackFilePath}`);
      } catch (fallbackErr) {
        console.error('[Itineraries] CRITICAL: Writable disk paths completely unavailable:', fallbackErr);
      }
    }
  }

  let savedItineraries: SavedHikeRecord[] = loadSavedItineraries();

  // Helper to sync itinerary record with Cloudflare D1
  async function syncItineraryToCloudflare(record: SavedHikeRecord): Promise<{ success: boolean; error?: string }> {
    const d = record.data;
    const prices = (d?.priceTiers || []).map((t) => Number(t.price) || 0).filter((p) => p > 0);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // Comprehensive payload matching worker format (omit explicit 'id' to avoid D1 UNIQUE constraint failures)
    const payload: Record<string, any> = {
      hike_number: String(record.hikeNumber || d?.hikeNumber || 'TBD'),
      hikeNumber: String(record.hikeNumber || d?.hikeNumber || 'TBD'),
      title: record.title || d?.title || 'Walk Nepal Walk Hike',
      trek_name: record.title || d?.title || 'Walk Nepal Walk Hike',
      category: record.category || d?.category || 'Overnight Bus Hikes',
      status: record.status || 'published',
      authorEmail: record.authorEmail || 'walknepalwalk@gmail.com',
      author_email: record.authorEmail || 'walknepalwalk@gmail.com',
      hike_date: d?.hikeDate || '',
      date: d?.hikeDate || '',
      expected_duration: d?.overview?.expectedDuration || '1 Day',
      days: d?.overview?.expectedDuration || '1 Day',
      difficulty: d?.overview?.difficulty || 'Moderate',
      meeting_point: d?.overview?.meetingPoint || 'Kathmandu, Nepal',
      start_location: d?.overview?.meetingPoint || 'Kathmandu, Nepal',
      elevation_range: d?.overview?.elevationRange || '',
      elevation: d?.overview?.elevationRange || '',
      cover_image_url: d?.coverImageUrl || '',
      featured_image: d?.coverImageUrl || '',
      min_price: minPrice,
      max_price: maxPrice,
      currency: d?.currency || 'NPR',
      price: minPrice ? `${d?.currency || 'NPR'} ${minPrice.toLocaleString()}` : '',
      team_leader: d?.teamLeader || 'TBD',
      max_capacity: Number(d?.maxCapacity) || 0,
      data_json: JSON.stringify(d || {}),
      data: d,
    };

    const payloadSize = JSON.stringify(payload).length;
    console.log(`[Cloudflare D1 Sync] Preparing to sync Hike #${record.hikeNumber}. Payload size: ${Math.round(payloadSize / 1024)}KB`);

    if (payloadSize > 800 * 1024) {
      console.warn(`[Cloudflare D1 Sync] WARNING: Payload size (${Math.round(payloadSize / 1024)}KB) is approaching Cloudflare's 1MB limit. Large base64 images may cause failures.`);
    }

    // 1. Try POST /treks/sync
    try {
      let res = await fetch(`${CLOUDFLARE_WORKER_URL}/treks/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const syncResp = await res.json().catch(() => ({}));
        console.log(`[Cloudflare D1] SUCCESS: Synced Hike #${record.hikeNumber} via /treks/sync. Response:`, JSON.stringify(syncResp));
        return { success: true };
      }

      let syncErr = await res.text().catch(() => 'No body');
      console.warn(`[Cloudflare D1 Sync] Failed /treks/sync Status ${res.status}:`, syncErr);

      // If UNIQUE constraint failed on id, retry payload stripping id explicitly
      if (syncErr.includes('UNIQUE constraint failed') || syncErr.includes('SQLITE_CONSTRAINT')) {
        console.log(`[Cloudflare D1] Retrying /treks/sync without conflicting ID...`);
        const strippedPayload = { ...payload };
        delete strippedPayload.id;
        const retryRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(strippedPayload),
          signal: AbortSignal.timeout(10000),
        });
        if (retryRes.ok) {
          console.log(`[Cloudflare D1] SUCCESS: Synced Hike #${record.hikeNumber} after stripping ID`);
          return { success: true };
        }
        syncErr = await retryRes.text().catch(() => 'No body');
      }

      // If /treks/sync gave 404 or 405, fallback to POST /treks
      if (res.status === 404 || res.status === 405) {
        console.log(`[Cloudflare D1] /treks/sync not found (404/405), trying fallback /treks...`);
        const fallbackRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        if (fallbackRes.ok) {
          console.log(`[Cloudflare D1] SUCCESS: Synced Hike #${record.hikeNumber} via /treks`);
          return { success: true };
        }
        const errTxt = await fallbackRes.text();
        console.error(`[Cloudflare D1 Sync Fallback FAILED] Status ${fallbackRes.status}:`, errTxt);
        return { success: false, error: `Cloudflare HTTP ${fallbackRes.status}: ${errTxt}` };
      }

      console.error(`[Cloudflare D1 Sync FAILED] Status ${res.status}:`, syncErr);
      return { success: false, error: `Cloudflare HTTP ${res.status}: ${syncErr}` };
    } catch (e: any) {
      console.error(`[Cloudflare D1 Sync ERROR] Network/Fetch exception for Hike #${record.hikeNumber}:`, e?.message || e);
      return { success: false, error: e?.message || 'Network exception connecting to Cloudflare Worker' };
    }
  }

  // Helper to delete from Cloudflare D1
  async function deleteItineraryFromCloudflare(hikeNumber: string) {
    if (!hikeNumber || hikeNumber === 'TBD') return;
    try {
      await fetch(`${CLOUDFLARE_WORKER_URL}/treks/${encodeURIComponent(hikeNumber)}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
      console.log(`[Cloudflare D1] Deleted Hike #${hikeNumber}`);
    } catch (e: any) {
      console.warn(`[Cloudflare D1] Delete note:`, e?.message || e);
    }
  }

  // GET /api/admin/itineraries - list all saved hikes
  app.get('/api/admin/itineraries', (req, res) => {
    return res.json({
      success: true,
      data: savedItineraries,
    });
  });

  // GET /api/admin/itineraries/:id - get single hike
  app.get('/api/admin/itineraries/:id', (req, res) => {
    const item = savedItineraries.find((h) => h.id === req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Hike not found' });
    }
    return res.json({ success: true, data: item });
  });

  // POST /api/admin/itineraries - create new hike record
  app.post('/api/admin/itineraries', async (req, res) => {
    try {
      const { data, status = 'draft', authorEmail = 'admin@walknepalwalk.com' } = req.body;
      if (!data || !data.title) {
        return res.status(400).json({ success: false, error: 'Missing hike data or title' });
      }

      const hikeNum = (data.hikeNumber || '').trim();
      const slug = (data.title || 'hike')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      const uniqueId = `hike-${hikeNum ? hikeNum + '-' : ''}${slug}-${Date.now().toString(36)}`;

      const newRecord: SavedHikeRecord = {
        id: uniqueId,
        hikeNumber: hikeNum || 'TBD',
        title: data.title,
        category: data.category || 'Overnight Bus Hikes',
        status: status as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        authorEmail,
        data,
      };

      savedItineraries.unshift(newRecord);
      saveItinerariesToDisk(savedItineraries);

      // Await sync to Cloudflare D1
      const syncResult = await syncItineraryToCloudflare(newRecord);
      
      // Refresh public treks list
      await revalidateTreks().catch(() => {});

      return res.status(201).json({ 
        success: true, 
        data: newRecord,
        sync: syncResult
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // PUT /api/admin/itineraries/:id - update or upsert hike record
  app.put('/api/admin/itineraries/:id', async (req, res) => {
    try {
      const idx = savedItineraries.findIndex((h) => h.id === req.params.id);
      const { data, status } = req.body;

      if (idx === -1) {
        // Record doesn't exist yet - upsert as new record
        const hikeNum = (data?.hikeNumber || '').trim();
        const newRecord: SavedHikeRecord = {
          id: req.params.id,
          hikeNumber: hikeNum || 'TBD',
          title: data?.title || 'Untitled Hike',
          category: data?.category || 'Overnight Bus Hikes',
          status: (status || 'draft') as any,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          authorEmail: 'admin@walknepalwalk.com',
          data: data || {},
        };
        savedItineraries.unshift(newRecord);
        saveItinerariesToDisk(savedItineraries);

        const syncResult = await syncItineraryToCloudflare(newRecord);
        return res.status(200).json({ success: true, data: newRecord, sync: syncResult });
      }

      const existing = savedItineraries[idx];

      const updatedRecord: SavedHikeRecord = {
        ...existing,
        hikeNumber: data?.hikeNumber ?? existing.hikeNumber,
        title: data?.title ?? existing.title,
        category: data?.category ?? existing.category,
        status: status ?? existing.status,
        updatedAt: new Date().toISOString(),
        data: data ?? existing.data,
      };

      savedItineraries[idx] = updatedRecord;
      saveItinerariesToDisk(savedItineraries);

      const syncResult = await syncItineraryToCloudflare(updatedRecord);
      await revalidateTreks().catch(() => {});

      return res.json({ success: true, data: updatedRecord, sync: syncResult });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/admin/itineraries/:id/clone - duplicate hike record
  app.post('/api/admin/itineraries/:id/clone', (req, res) => {
    try {
      const source = savedItineraries.find((h) => h.id === req.params.id);
      if (!source) {
        return res.status(404).json({ success: false, error: 'Source hike not found' });
      }

      const cloneId = `hike-copy-${Date.now().toString(36)}`;
      const clonedTitle = `${source.title} (Copy)`;
      const clonedData = JSON.parse(JSON.stringify(source.data));
      clonedData.title = clonedTitle;

      const clonedRecord: SavedHikeRecord = {
        ...source,
        id: cloneId,
        title: clonedTitle,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        data: clonedData,
      };

      savedItineraries.unshift(clonedRecord);
      saveItinerariesToDisk(savedItineraries);

      syncItineraryToCloudflare(clonedRecord).catch(() => {});
      revalidateTreks().catch(() => {});

      return res.status(201).json({ success: true, data: clonedRecord });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // PATCH /api/admin/itineraries/:id/status - toggle status
  app.patch('/api/admin/itineraries/:id/status', (req, res) => {
    try {
      const idx = savedItineraries.findIndex((h) => h.id === req.params.id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Hike not found' });
      }

      const { status } = req.body;
      if (!['draft', 'published', 'archived'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
      }

      savedItineraries[idx].status = status;
      savedItineraries[idx].updatedAt = new Date().toISOString();
      saveItinerariesToDisk(savedItineraries);

      syncItineraryToCloudflare(savedItineraries[idx]).catch(() => {});
      revalidateTreks().catch(() => {});

      return res.json({ success: true, data: savedItineraries[idx] });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/admin/sync-all-to-cloudflare - Bulk push all saved itineraries to D1
  app.post('/api/admin/sync-all-to-cloudflare', async (req, res) => {
    try {
      const results: Array<{ hikeNumber: string; success: boolean; error?: string }> = [];
      for (const item of savedItineraries) {
        const syncRes = await syncItineraryToCloudflare(item);
        results.push({ hikeNumber: item.hikeNumber, ...syncRes });
      }
      await revalidateTreks();
      return res.json({
        success: true,
        message: `Synced ${results.filter((r) => r.success).length}/${results.length} treks to Cloudflare D1`,
        results,
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // POST /api/admin/diagnostics/cloudflare - Test connectivity to Cloudflare Worker
  app.post('/api/admin/diagnostics/cloudflare', async (req, res) => {
    try {
      const results: any = {
        workerUrl: CLOUDFLARE_WORKER_URL,
        timestamp: new Date().toISOString(),
        checks: []
      };

      // Check 1: GET /treks
      try {
        const t1 = Date.now();
        const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks`, { signal: AbortSignal.timeout(5000) });
        results.checks.push({
          endpoint: '/treks',
          status: cfRes.status,
          ok: cfRes.ok,
          latency: Date.now() - t1,
          response: await cfRes.text().catch(() => 'No response body')
        });
      } catch (e: any) {
        results.checks.push({ endpoint: '/treks', error: e.message, ok: false });
      }

      // Check 2: GET /registrations
      try {
        const t1 = Date.now();
        const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/registrations`, { signal: AbortSignal.timeout(5000) });
        results.checks.push({
          endpoint: '/registrations',
          status: cfRes.status,
          ok: cfRes.ok,
          latency: Date.now() - t1
        });
      } catch (e: any) {
        results.checks.push({ endpoint: '/registrations', error: e.message, ok: false });
      }

      return res.json({ success: true, ...results });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // DELETE /api/admin/itineraries/:id - delete hike record
  app.delete('/api/admin/itineraries/:id', (req, res) => {
    try {
      const idx = savedItineraries.findIndex((h) => h.id === req.params.id);
      if (idx === -1) {
        return res.status(404).json({ success: false, error: 'Hike not found' });
      }

      const deleted = savedItineraries.splice(idx, 1)[0];
      saveItinerariesToDisk(savedItineraries);

      deleteItineraryFromCloudflare(deleted.hikeNumber).catch(() => {});
      revalidateTreks().catch(() => {});

      return res.json({ success: true, data: deleted });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  // ===== VITE MIDDLEWARE / STATIC SERVING =====
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0', port: 3000 },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Initial warmup of trek and registration data
  revalidateTreks()
    .then(() => {
      console.log(`[WNW Server] Initialized ${treks.length} treks with live participant counts.`);
    })
    .catch((err) => console.warn('[WNW Server] Initial trek warmup failed:', err));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
