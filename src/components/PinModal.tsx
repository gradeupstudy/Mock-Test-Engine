import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, X, CheckCircle2 } from 'lucide-react';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  title?: string;
  description?: string;
  requiredPin?: string;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  title = 'Security PIN Verification Required',
  description = 'Please enter the administrative security PIN code to proceed with this operation.',
  requiredPin = '260298'
}) => {
  const [pinInput, setPinInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const activePin = localStorage.getItem('app_security_pin') || requiredPin || '260298';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim() === activePin) {
      setErrorMsg(null);
      setPinInput('');
      onSuccess();
      onClose();
    } else {
      setErrorMsg(`Invalid Security PIN code! Please enter the correct PIN (${activePin}).`);
    }
  };

  const handleQuickFill = () => {
    setPinInput(activePin);
    setErrorMsg(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0e1230] border border-[#2d3a8c] rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3">
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl">
            <Lock className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">{title}</h3>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                <span>Enter Security PIN</span>
              </label>

              <button
                type="button"
                onClick={handleQuickFill}
                className="text-[11px] text-amber-300 hover:text-amber-200 bg-amber-500/20 hover:bg-amber-500/30 px-2 py-0.5 rounded border border-amber-500/40 transition-colors font-mono flex items-center space-x-1"
                title="Click to auto-fill active security PIN"
              >
                <span>Example PIN:</span>
                <strong className="underline">{activePin}</strong>
              </button>
            </div>

            <input
              type="text"
              maxLength={10}
              value={pinInput}
              onChange={e => {
                setPinInput(e.target.value);
                setErrorMsg(null);
              }}
              placeholder={`Enter PIN (e.g. ${activePin})`}
              autoFocus
              className="w-full bg-slate-950 border border-slate-700 text-white font-mono text-center tracking-widest text-lg rounded-xl py-2.5 px-4 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all placeholder:text-slate-600"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-950/80 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-md transition-colors flex items-center space-x-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Verify & Confirm</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
