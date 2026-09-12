import React, { useState, useEffect } from 'react';
import { X, ExternalLink, FileText, HelpCircle, Compass, RefreshCw, AlertTriangle } from 'lucide-react';
import { Trek } from '../types';

interface ItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  trek: Trek | null;
  type?: 'itinerary' | 'faq';
}

export const ItineraryModal: React.FC<ItineraryModalProps> = ({
  isOpen,
  onClose,
  trek,
  type = 'itinerary',
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Reset states when trek or modal opens
  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setHasError(false);
    }
  }, [isOpen, trek?.id, type]);

  if (!isOpen || !trek) return null;

  const rawUrl = type === 'itinerary' ? trek.itinerary_link : trek.faq_link;
  const isFaq = type === 'faq';

  // Use the server-side preview proxy to eliminate X-Frame-Options: DENY from Google Sites
  const embedUrl = rawUrl ? `/api/itinerary-preview?url=${encodeURIComponent(rawUrl)}` : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-[92vh] sm:h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[#EFEAE4]">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3.5 sm:px-6 py-3 border-b border-[#EFEAE4] bg-[#FDFBF9] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#E08828]/10 text-[#E08828] flex items-center justify-center shrink-0">
              {isFaq ? <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" /> : <FileText className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-[#1F1F1F] truncate">
                {trek.name}
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] text-[#8B8680]">
                <span>{isFaq ? 'FAQ & Guide' : 'Route & Cost Itinerary'}</span>
                {trek.hike_number && (
                  <span className="bg-[#E5E1DB] text-[#5A5551] px-1.5 py-0.2 rounded text-[10px] font-semibold">
                    Hike #{trek.hike_number}
                  </span>
                )}
                {trek.leader && (
                  <span className="hidden xs:inline text-[#7ABA42] font-medium">
                    Guide: {trek.leader}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {rawUrl && (
              <a
                href={rawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-[#5A5551] bg-white border border-[#E5E1DB] rounded-xl hover:bg-[#F9F7F5] transition-all shadow-2xs"
                title="Open directly in browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#E08828]" />
                <span className="text-[11px] sm:text-xs">Open in Tab</span>
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-xl text-[#8B8680] hover:text-[#1F1F1F] hover:bg-[#F0ECE7] transition-all"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body with in-app preview */}
        <div className="flex-1 bg-[#F9F7F5] relative overflow-hidden flex flex-col">
          {embedUrl ? (
            <div className="w-full h-full flex flex-col relative">
              {/* Loading State Spinner */}
              {isLoading && (
                <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-2xs flex flex-col items-center justify-center p-6 text-center">
                  <div className="w-8 h-8 border-3 border-[#E08828] border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-xs font-bold text-[#1F1F1F]">Loading In-App Itinerary Preview...</p>
                  <p className="text-[11px] text-[#8B8680] mt-1 max-w-xs">
                    Fetching the latest Google Site route schedule for Hike #{trek.hike_number || trek.id}
                  </p>
                </div>
              )}

              {/* Error fallback if iframe failed */}
              {hasError ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white">
                  <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mb-3">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#1F1F1F]">
                    Preview Notice
                  </h3>
                  <p className="text-xs text-[#8B8680] max-w-sm mt-1 mb-4">
                    This itinerary is hosted on Google Sites. Tap below to view the complete schedule and cost details in your browser.
                  </p>
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#E08828] text-white text-xs font-bold rounded-xl hover:bg-[#C86B1A] transition-all shadow-sm"
                  >
                    <span>Open Full Itinerary Page</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ) : (
                <div className="w-full flex-1 overflow-auto -webkit-overflow-scrolling-touch bg-white">
                  <iframe
                    src={embedUrl}
                    title={`${trek.name} ${isFaq ? 'FAQ' : 'Itinerary'}`}
                    className="w-full h-full border-0 min-h-[500px]"
                    onLoad={() => setIsLoading(false)}
                    onError={() => {
                      setIsLoading(false);
                      setHasError(true);
                    }}
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                  />
                </div>
              )}

              {/* Footer Toolbar */}
              <div className="p-2.5 sm:p-3 bg-white border-t border-[#EFEAE4] flex items-center justify-between text-xs text-[#8B8680] shrink-0">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="truncate text-[11px]">
                    Live Walk Nepal Walk Guide Document
                  </span>
                </div>
                {rawUrl && (
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#E08828] hover:text-[#C86B1A] font-bold flex items-center gap-1 shrink-0 text-xs hover:underline ml-2"
                  >
                    <span>Direct Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-white">
              <Compass className="w-12 h-12 text-[#8B8680] mb-3 opacity-40" />
              <h3 className="text-base font-bold text-[#1F1F1F] mb-1">
                Itinerary is being finalized
              </h3>
              <p className="text-xs text-[#8B8680] max-w-sm">
                Our guide team is updating the itinerary details for this trek. Contact the hike leader or check back shortly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
