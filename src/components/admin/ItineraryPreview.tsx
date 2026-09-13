import React from 'react';
import {
  TrekItineraryData
} from '../../data/defaultItineraryTemplate';
import {
  Calendar,
  Clock,
  MapPin,
  Mountain,
  CheckCircle2,
  XCircle,
  PlusCircle,
  ShieldCheck,
  Phone,
  MessageCircle,
  ArrowLeft,
  Share2,
  FileCheck2,
  Layers,
  Sparkles
} from 'lucide-react';

interface ItineraryPreviewProps {
  data: TrekItineraryData;
  onBackToEdit: () => void;
  onPublishTemplate?: () => void;
  onShare?: () => void;
}

export const ItineraryPreview: React.FC<ItineraryPreviewProps> = ({
  data,
  onBackToEdit,
  onPublishTemplate,
  onShare,
}) => {
  return (
    <div className="w-full bg-[#FDFBF9] min-h-screen text-[#1F1F1F]">
      {/* Sticky Admin Preview Action Header */}
      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#EFEAE4] px-4 py-3 shadow-xs">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBackToEdit}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F4EFEA] hover:bg-[#EBE5DE] text-[#1F1F1F] rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Editor</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              Public Itinerary Preview Mode
            </span>
            {onShare && (
              <button
                type="button"
                onClick={onShare}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#25D366]/15 hover:bg-[#25D366] text-[#128C7E] hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>
            )}
            {onPublishTemplate && (
              <button
                type="button"
                onClick={onPublishTemplate}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#7ABA42] hover:bg-[#6CA838] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Publish Itinerary</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Section 1 & 2: Hero & Basic Info */}
        <div className="bg-white rounded-3xl border border-[#EFEAE4] shadow-xs relative overflow-hidden">
          {data.coverImageUrl && (
            <div className="relative h-48 sm:h-64 w-full overflow-hidden bg-neutral-900">
              <img
                src={data.coverImageUrl}
                alt={data.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1200&q=80';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />
              <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-white">
                <span className="text-xs font-bold tracking-wider uppercase bg-black/50 backdrop-blur-md px-3 py-1 rounded-lg border border-white/20">
                  Walk Nepal Walk Official Itinerary
                </span>
                <span className="text-xs font-black bg-[#E08828] px-3 py-1 rounded-lg">
                  {data.overview.difficulty || 'Moderate'}
                </span>
              </div>
            </div>
          )}

          <div className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="px-3 py-1 rounded-full text-xs font-black tracking-wide uppercase bg-[#E08828]/10 text-[#E08828] border border-[#E08828]/20">
                Hike #{data.hikeNumber || '---'}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#7ABA42]/10 text-[#5B8F2D] border border-[#7ABA42]/20">
                {data.category}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-[#5A5551]">
                <Calendar className="w-3 h-3 inline mr-1 text-[#8B8680]" />
                {data.hikeDate || 'Date to be announced'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#1F1F1F] tracking-tight leading-tight mb-4">
              {data.title || 'Untitled Hike Itinerary'}
            </h1>

          {/* Pricing Tiers Matrix */}
          <div className="mt-6 pt-5 border-t border-[#F0EBE5]">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B8680] block mb-2.5">
              Available Package Pricing
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {data.priceTiers && data.priceTiers.length > 0 ? (
                data.priceTiers.map((tier, idx) => (
                  <div
                    key={tier.id || idx}
                    className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#EFEAE4] flex flex-col justify-between"
                  >
                    <span className="text-xs font-semibold text-[#5A5551]">{tier.label}</span>
                    <div className="mt-2 flex items-baseline gap-1">
                      <span className="text-lg sm:text-xl font-black text-[#1F1F1F]">
                        {data.currency} {Number(tier.price).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-[#8B8680]">/ person</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 rounded-xl bg-[#FAF8F5] text-xs text-[#8B8680]">
                  No pricing tiers specified
                </div>
              )}
            </div>

              {data.pricingNotes && (
                <p className="mt-3 text-xs text-[#8B8680] italic flex items-center gap-1.5">
                  <span>ℹ️</span>
                  <span>{data.pricingNotes}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Hike Overview Cards */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFEAE4] shadow-xs">
          <h2 className="text-base sm:text-lg font-black text-[#1F1F1F] mb-4 flex items-center gap-2">
            <Mountain className="w-5 h-5 text-[#7ABA42]" />
            <span>Hike Overview & Metrics</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#EFEAE4]">
              <span className="text-[11px] text-[#8B8680] font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#E08828]" /> Meeting Time
              </span>
              <p className="text-sm font-bold text-[#1F1F1F] mt-1">{data.overview.meetingTime || '---'}</p>
            </div>

            <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#EFEAE4]">
              <span className="text-[11px] text-[#8B8680] font-semibold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-[#E08828]" /> Meeting Point
              </span>
              <p className="text-sm font-bold text-[#1F1F1F] mt-1">{data.overview.meetingPoint || '---'}</p>
            </div>

            <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#EFEAE4]">
              <span className="text-[11px] text-[#8B8680] font-semibold flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-[#7ABA42]" /> Duration
              </span>
              <p className="text-sm font-bold text-[#1F1F1F] mt-1">{data.overview.expectedDuration || '---'}</p>
            </div>

            <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#EFEAE4]">
              <span className="text-[11px] text-[#8B8680] font-semibold flex items-center gap-1">
                <Mountain className="w-3.5 h-3.5 text-[#7ABA42]" /> Difficulty
              </span>
              <p className="text-sm font-bold text-[#1F1F1F] mt-1">{data.overview.difficulty || '---'}</p>
            </div>

            <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#EFEAE4]">
              <span className="text-[11px] text-[#8B8680] font-semibold flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-[#E08828]" /> Distance & Altitudes
              </span>
              <p className="text-sm font-bold text-[#1F1F1F] mt-1">{data.overview.approxDistance || '---'}</p>
              <p className="text-[11px] text-[#8B8680] mt-0.5">
                {data.overview.elevationRange} • {data.overview.elevationGross}
              </p>
            </div>

            <div className="p-3.5 bg-[#FAF8F5] rounded-2xl border border-[#EFEAE4]">
              <span className="text-[11px] text-[#8B8680] font-semibold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" /> Ending Point
              </span>
              <p className="text-sm font-bold text-[#1F1F1F] mt-1">{data.overview.endingPoint || '---'}</p>
            </div>
          </div>
        </div>

        {/* Section 4 & 5: Cost Includes & Cost Excludes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Inclusions */}
          <div className="bg-white rounded-3xl p-6 border border-emerald-100 shadow-xs">
            <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Cost Includes</span>
            </h3>
            <ul className="space-y-2.5">
              {data.costIncludes.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-[#3D3A37] leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Exclusions */}
          <div className="bg-white rounded-3xl p-6 border border-rose-100 shadow-xs">
            <h3 className="text-sm font-bold text-rose-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-rose-500" />
              <span>Cost Excludes</span>
            </h3>
            <ul className="space-y-2.5">
              {data.costExcludes.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs text-[#3D3A37] leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-1.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Section 6: Additional Add-Ons */}
        {data.addOns && data.addOns.length > 0 && (
          <div className="bg-white rounded-3xl p-6 border border-[#EFEAE4] shadow-xs">
            <h3 className="text-sm font-bold text-[#1F1F1F] uppercase tracking-wider mb-3 flex items-center gap-2">
              <PlusCircle className="w-4 h-4 text-[#E08828]" />
              <span>Optional Add-Ons & Room Customizations</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {data.addOns.map((addon, idx) => (
                <div key={addon.id || idx} className="p-3 bg-[#FAF8F5] rounded-2xl border border-[#EFEAE4] flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1F1F1F]">{addon.name}</span>
                  <span className="text-xs font-black text-[#E08828]">
                    {data.currency} {Number(addon.price).toLocaleString()} <span className="text-[10px] font-normal text-[#8B8680]">{addon.unit}</span>
                  </span>
                </div>
              ))}
            </div>
            {data.addOnsNotice && (
              <p className="text-[11px] text-[#8B8680] italic">
                {data.addOnsNotice}
              </p>
            )}
          </div>
        )}

        {/* Section 7: Itinerary Details (Day-by-Day Timeline) */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFEAE4] shadow-xs">
          <h2 className="text-base sm:text-lg font-black text-[#1F1F1F] mb-6 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#E08828]" />
            <span>Itinerary Details & Schedule</span>
          </h2>

          <div className="space-y-6">
            {data.itineraryDays.map((day) => (
              <div key={day.id} className="border-l-2 border-[#E08828]/40 pl-4 sm:pl-6 space-y-3 relative">
                <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-[#E08828] text-white flex items-center justify-center text-[9px] font-bold">
                  {day.dayNumber}
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#1F1F1F]">
                    Day {day.dayNumber}: {day.title}
                  </h3>
                </div>

                <div className="space-y-2 mt-2">
                  {day.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 p-2.5 rounded-xl bg-[#FAF8F5] text-xs"
                    >
                      <span className="font-bold text-[#E08828] shrink-0 w-24">
                        {item.time}
                      </span>
                      <span className="text-[#3D3A37]">{item.activity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 8: Booking Process & Participation Guidelines */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#EFEAE4] shadow-xs space-y-6">
          <div>
            <h2 className="text-base sm:text-lg font-black text-[#1F1F1F] mb-4 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#7ABA42]" />
              <span>Booking Process & Policy Notes</span>
            </h2>

            <ol className="space-y-3">
              {data.bookingProcessSteps.map((step, idx) => (
                <li key={idx} className="flex items-start gap-3 text-xs text-[#3D3A37]">
                  <span className="w-5 h-5 rounded-full bg-[#7ABA42]/15 text-[#5B8F2D] flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>

            {data.bookingNotes && data.bookingNotes.length > 0 && (
              <div className="mt-4 p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-1.5">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">Important Booking Notes:</span>
                {data.bookingNotes.map((note, idx) => (
                  <p key={idx} className="text-xs text-amber-900/90 leading-relaxed">
                    • {note}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="pt-5 border-t border-[#F0EBE5]">
            <h3 className="text-sm font-black text-[#1F1F1F] mb-2">
              Participation & Age Guidelines
            </h3>
            <p className="text-xs text-[#5A5551] leading-relaxed">
              {data.participationGuidelines}
            </p>
          </div>

          <div className="pt-5 border-t border-[#F0EBE5]">
            <h3 className="text-sm font-black text-[#1F1F1F] mb-3">
              Participation, Safety & Trail Ethics
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.safetyRules.map((rule) => (
                <div key={rule.id} className="p-3 bg-[#FAF8F5] rounded-xl border border-[#EFEAE4]">
                  <span className="text-xs font-bold text-[#1F1F1F] block mb-0.5">{rule.title}</span>
                  <p className="text-[11px] text-[#6A6560] leading-relaxed">{rule.description}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Need Help WhatsApp footer */}
          <div className="p-4 bg-[#7ABA42]/10 border border-[#7ABA42]/30 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <span className="text-xs font-bold text-[#1F1F1F] flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4 text-[#5B8F2D]" />
                Need help or custom coordination?
              </span>
              <p className="text-[11px] text-[#5A5551] mt-0.5">
                Direct WhatsApp assistance: {data.helpContacts.join('  •  ')}
              </p>
            </div>
            <a
              href={`https://wa.me/9779803568612?text=${encodeURIComponent(`Hi Walk Nepal Walk, I have a question regarding Hike #${data.hikeNumber} (${data.title})`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-1.5 bg-[#7ABA42] hover:bg-[#6CA838] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp Support</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
