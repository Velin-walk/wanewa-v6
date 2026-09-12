import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { Trek, Booking, Invite } from './src/types';

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

  function mapD1Trek(row: any): Trek {
    const diffRaw = (row.difficulty || 'Easy').toLowerCase();
    const diff: 'easy' | 'moderate' | 'difficult' =
      diffRaw === 'hard' ? 'difficult' : diffRaw === 'moderate' ? 'moderate' : 'easy';

    return {
      id: String(row.hike_number || row.trek_name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
      hike_number: String(row.hike_number || ''),
      name: row.trek_name,
      date: row.date,
      days: row.days || '1',
      difficulty: diff,
      leader: row.team_leader || 'Walk Nepal Walk Guide',
      capacity: Number(row.max_capacity) || 25,
      participants: Number(row.registered_pax) || 0,
      itinerary_link: row.itinerary_link || '',
      faq_link: row.faq_link || '',
      whatsapp_link: row.whatsapp_link || '',
      price: row.price || '',
      featured_image:
        row.thumbnail_url ||
        'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80',
      fitness_level: 'All fitness levels',
      season: row.season || 'Autumn / Year-round',
      type_of_trail: row.type_of_trail || (row.days?.includes('Subs')
        ? 'Subscription Hike'
        : row.days?.includes('Overnight')
        ? 'Overnight Bus Hike'
        : 'Alpine Trek'),
      start_location: row.start_location || 'Kathmandu, Nepal',
      elevation: row.elevation || '',
      itinerary: row.itinerary || '',
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
      const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (cfRes.ok) {
        const cfJson = (await cfRes.json()) as { success: boolean; data: any[] };
        if (cfJson.success && Array.isArray(cfJson.data) && cfJson.data.length > 0) {
          const mapped = cfJson.data.map(mapD1Trek);
          const enriched = await enrichTreksWithLiveParticipants(mapped);
          treks = enriched;
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        // Silent timeout recovery - existing cached treks remain active
      } else {
        console.warn('[WNW Server] Revalidation note:', err?.message || err);
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
        const cfRes = await fetch(`${CLOUDFLARE_WORKER_URL}/treks`, {
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

    res.json(treks);
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
      });

      if (!response.ok) {
        return res
          .status(response.status)
          .send(`Unable to fetch preview: ${response.statusText}`);
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
      console.error('Error proxying itinerary preview:', err);
      return res.status(500).send('Unable to load preview at this time.');
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
   * POST /api/mapminers/contribute - Save contributed trail files and update metadata
   */
  app.post('/api/mapminers/contribute', async (req, res) => {
    try {
      const {
        fileName,
        fileContent,
        name,
        description,
        difficulty,
        stats,
        bounds,
        startPos,
        contributorName,
        contributorEmail,
        province,
        district,
        nearbyCity,
        highlights
      } = req.body;

      if (!fileName || !fileContent || !name) {
        return res.status(400).json({ error: 'Missing required parameters: fileName, fileContent, or name' });
      }

      // 1. Sanitize filename to prevent directory traversal
      const cleanFileName = fileName.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
      const uniqueFileName = `${Date.now()}_${cleanFileName}`;

      const kmlDir = path.join(process.cwd(), 'public', 'mapminers', 'kml');
      
      // Ensure the directory exists
      if (!fs.existsSync(kmlDir)) {
        fs.mkdirSync(kmlDir, { recursive: true });
      }

      // 2. Write the GPX/KML file contents to public directory
      const filePath = path.join(kmlDir, uniqueFileName);
      fs.writeFileSync(filePath, fileContent, 'utf-8');

      // 3. Read, update, and write routes-metadata.json
      const metadataPath = path.join(kmlDir, 'routes-metadata.json');
      let metadataMap: Record<string, any> = {};

      if (fs.existsSync(metadataPath)) {
        try {
          const rawMetadata = fs.readFileSync(metadataPath, 'utf-8');
          metadataMap = JSON.parse(rawMetadata);
        } catch (e) {
          console.error('Error reading/parsing routes-metadata.json, recreating:', e);
        }
      }

      // Add the new item
      metadataMap[uniqueFileName] = {
        name,
        description: description || '',
        difficultyOverride: difficulty || 'Auto',
        hoursOverride: 'Auto',
        contributorName: contributorName || 'Community Member',
        contributorEmail: contributorEmail || '',
        contributorUid: '',
        calculatedDifficulty: difficulty || 'Moderate',
        stats: {
          distance: stats?.distance || 0,
          elevationGain: stats?.elevationGain || 0,
          elevationLoss: stats?.elevationLoss || 0,
          minElevation: stats?.minElevation || 0,
          maxElevation: stats?.maxElevation || 0,
          startElevation: stats?.startElevation || 0,
          endElevation: stats?.endElevation || 0,
          estimatedHours: stats?.estimatedHours || 0,
        },
        bounds: bounds || [[27.7, 85.3], [27.8, 85.4]],
        startPos: startPos || { lat: 27.7, lng: 85.3 },
        province: province || 'Bagmati',
        district: district || 'Kathmandu',
        nearbyCity: nearbyCity || 'Kathmandu',
        highlights: highlights || 'Uploaded by community',
        uploadedAt: new Date().toISOString()
      };

      fs.writeFileSync(metadataPath, JSON.stringify(metadataMap, null, 2), 'utf-8');

      console.log(`[MapMiners] Persisted contributed trail "${name}" to ${uniqueFileName} and metadata!`);

      return res.json({
        success: true,
        fileName: uniqueFileName,
        message: 'Trail file uploaded and registered successfully!'
      });
    } catch (err: any) {
      console.error('Error handling mapminers contribution:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
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

  // Background warmup of trek and registration data from Cloudflare
  fetch(`${CLOUDFLARE_WORKER_URL}/treks`)
    .then((r) => r.json())
    .then(async (data: any) => {
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const mapped = data.data.map(mapD1Trek);
        treks = await enrichTreksWithLiveParticipants(mapped);
        console.log(`[WNW Server] Warmed up ${treks.length} treks with live participant counts.`);
      }
    })
    .catch((err) => console.warn('[WNW Server] Background trek warmup failed:', err));

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
