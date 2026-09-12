import React, { useState } from 'react';
import { Trek } from '../types';
import { ParticipantStack } from './ParticipantStack';
import {
  Calendar,
  Clock,
  Mountain,
  Compass,
  Heart,
  Share2,
  ChevronDown,
  ChevronUp,
  UserCheck,
  FileText,
  HelpCircle,
} from 'lucide-react';

interface TrekCardProps {
  trek: Trek;
  isFavorited?: boolean;
  onToggleFavorite?: (id: string) => void;
  onRegister: (trek: Trek) => void;
  onShare: (trek: Trek) => void;
  onViewItinerary?: (trek: Trek) => void;
  onViewFaq?: (trek: Trek) => void;
}

export const TrekCard: React.FC<TrekCardProps> = ({
  trek,
  isFavorited = false,
  onToggleFavorite,
  onRegister,
  onShare,
  onViewItinerary,
  onViewFaq,
}) => {
  const [showItinerary, setShowItinerary] = useState(false);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) {
          return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          });
        }
      }
    }
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        });
      }
    } catch {
      // fallback
    }
    return dateStr;
  };

  const getDifficultyBadge = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case 'easy':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          label: 'Easy',
        };
      case 'moderate':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          label: 'Moderate',
        };
      case 'difficult':
      case 'hard':
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          label: 'Difficult',
        };
      default:
        return {
          bg: 'bg-neutral-100 text-neutral-600 border-neutral-200',
          label: difficulty || 'General',
        };
    }
  };

  const badge = getDifficultyBadge(trek.difficulty);
  const currentParticipants = trek.participants || 0;
  const isFull = currentParticipants >= trek.capacity;
  const fillPercentage = Math.min(100, Math.round((currentParticipants / trek.capacity) * 100));

  return (
    <div className="bg-white rounded-2xl border border-[#EFEAE4] p-3.5 sm:p-4 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between w-full max-w-full overflow-hidden">
      <div>
        {/* Card Top */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${badge.bg}`}
              >
                {badge.label}
              </span>
              {trek.hike_number && (
                <span className="text-[10px] font-bold text-[#5A5551] bg-[#F4EFEA] px-2 py-0.5 rounded-md border border-[#E5E1DB]">
                  Hike #{trek.hike_number}
                </span>
              )}
              {trek.elevation && (
                <span className="text-[10px] font-semibold text-[#8B8680] flex items-center gap-0.5 bg-[#F9F7F5] px-1.5 py-0.5 rounded-md border border-[#E5E1DB]">
                  <Mountain className="w-3 h-3 text-[#E08828]" />
                  {trek.elevation}
                </span>
              )}
            </div>

            <h3 className="text-base sm:text-lg font-bold text-[#1F1F1F] leading-snug">
              {trek.name}
            </h3>

            <div className="flex items-center gap-2.5 text-xs text-[#8B8680] mt-1 flex-wrap">
              <span className="flex items-center gap-1 font-medium">
                <Calendar className="w-3.5 h-3.5 text-[#E08828] shrink-0" />
                {formatDate(trek.date)}
              </span>
              {trek.start_location && (
                <span className="flex items-center gap-1 truncate max-w-[160px] font-medium">
                  <Compass className="w-3.5 h-3.5 text-[#7ABA42] shrink-0" />
                  {trek.start_location}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onToggleFavorite?.(trek.id)}
            className={`p-2.5 rounded-xl transition-all shrink-0 active:scale-90 ${
              isFavorited
                ? 'text-rose-500 bg-rose-50 border border-rose-200'
                : 'text-[#8B8680] hover:text-rose-500 bg-[#F9F7F5] border border-[#E5E1DB]'
            }`}
            title={isFavorited ? 'Remove from favorites' : 'Save trek'}
            aria-label="Toggle Favorite"
          >
            <Heart className={`w-4 h-4 ${isFavorited ? 'fill-rose-500' : ''}`} />
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-1.5 my-3 py-2 px-2.5 bg-[#F9F7F5] rounded-xl border border-[#F0EBE5] text-center">
          <div>
            <span className="text-[9px] font-bold uppercase text-[#8B8680] tracking-wider block truncate">
              Type / Duration
            </span>
            <span className="text-xs font-bold text-[#1F1F1F] flex items-center justify-center gap-1 mt-0.5 truncate">
              <Clock className="w-3 h-3 text-[#E08828] shrink-0" />
              <span className="truncate">{trek.days}</span>
            </span>
          </div>

          <div className="border-x border-[#E5E1DB]">
            <span className="text-[9px] font-bold uppercase text-[#8B8680] tracking-wider block">
              Grade
            </span>
            <span className="text-xs font-bold capitalize text-[#1F1F1F] mt-0.5 block truncate">
              {trek.difficulty}
            </span>
          </div>

          <div>
            <span className="text-[9px] font-bold uppercase text-[#8B8680] tracking-wider block">
              Slots
            </span>
            <span className="text-xs font-bold text-[#1F1F1F] mt-0.5 block">
              {currentParticipants}/{trek.capacity}
            </span>
          </div>
        </div>

        {/* Capacity Bar */}
        <div className="mb-2.5">
          <div className="w-full bg-[#E5E1DB] h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                fillPercentage > 90
                  ? 'bg-[#EF4444]'
                  : fillPercentage > 70
                  ? 'bg-[#E08828]'
                  : 'bg-[#7ABA42]'
              }`}
              style={{ width: `${fillPercentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] text-[#8B8680] mt-1">
            <span>Roster status</span>
            <span className="font-semibold text-[#1F1F1F]">
              {trek.capacity - currentParticipants > 0
                ? `${trek.capacity - currentParticipants} spots left`
                : 'Full roster'}
            </span>
          </div>
        </div>

        {/* Participant Stack */}
        <ParticipantStack
          participantsCount={trek.participants_by_gender}
          recentParticipants={trek.recent_participants}
        />

        {/* Leader Info */}
        {trek.leader && (
          <div className="flex items-center gap-1.5 text-[11px] text-[#5A5551] pt-1.5 border-t border-[#F0EBE5]">
            <UserCheck className="w-3.5 h-3.5 text-[#7ABA42] shrink-0" />
            <span className="font-medium text-[#8B8680]">Lead Guide:</span>
            <span className="font-semibold text-[#1F1F1F] truncate">{trek.leader}</span>
          </div>
        )}

        {/* Live Itinerary & FAQ Buttons */}
        {(trek.itinerary_link || trek.faq_link) && (
          <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-[#F0EBE5] flex-wrap">
            {trek.itinerary_link && (
              <button
                type="button"
                onClick={() => onViewItinerary ? onViewItinerary(trek) : window.open(trek.itinerary_link, '_blank')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#E08828] hover:text-[#C86B1A] bg-[#E08828]/10 hover:bg-[#E08828]/15 rounded-lg transition-all"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>View Itinerary</span>
              </button>
            )}
            {trek.faq_link && (
              <button
                type="button"
                onClick={() => onViewFaq ? onViewFaq(trek) : window.open(trek.faq_link, '_blank')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#5A5551] hover:text-[#1F1F1F] bg-[#F4EFEA] hover:bg-[#EAE4DC] rounded-lg transition-all"
              >
                <HelpCircle className="w-3.5 h-3.5 text-[#8B8680]" />
                <span>FAQ</span>
              </button>
            )}
          </div>
        )}

        {/* In-card text itinerary if available */}
        {trek.itinerary && (
          <div className="mt-1.5 text-xs">
            <button
              type="button"
              onClick={() => setShowItinerary(!showItinerary)}
              className="text-[#E08828] hover:text-[#C86B1A] font-semibold flex items-center gap-1 py-1 text-[11px]"
            >
              {showItinerary ? (
                <>
                  Hide Overview <ChevronUp className="w-3 h-3" />
                </>
              ) : (
                <>
                  Quick Summary <ChevronDown className="w-3 h-3" />
                </>
              )}
            </button>
            {showItinerary && (
              <div className="mt-1.5 p-2.5 bg-[#F9F7F5] rounded-xl border border-[#F0EBE5] text-[#5A5551] whitespace-pre-line leading-relaxed text-[11px]">
                {trek.itinerary}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-[#F0EBE5]">
        <button
          type="button"
          onClick={() => onShare(trek)}
          className="flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-xs font-semibold text-[#5A5551] bg-[#F9F7F5] hover:bg-[#F0ECE7] border border-[#E5E1DB] rounded-xl active:scale-[0.98] transition-all"
        >
          <Share2 className="w-3.5 h-3.5 text-[#E08828]" />
          <span>Invite</span>
        </button>

        <button
          type="button"
          disabled={isFull}
          onClick={() => onRegister(trek)}
          className={`flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-xs font-bold rounded-xl transition-all text-white ${
            isFull
              ? 'bg-[#8B8680] cursor-not-allowed opacity-70'
              : 'bg-[#7ABA42] hover:bg-[#6CA838] active:scale-[0.98] shadow-xs'
          }`}
        >
          {isFull ? 'Waitlist' : 'Register'}
        </button>
      </div>
    </div>
  );
};
