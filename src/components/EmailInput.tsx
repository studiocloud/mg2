import React from 'react';
import { Mail, Loader2 } from 'lucide-react';

interface EmailInputProps {
  email: string;
  setEmail: (email: string) => void;
  onValidate: () => void;
  loading: boolean;
}

export function EmailInput({ email, setEmail, onValidate, loading }: EmailInputProps) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
          Single Email Validation
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter email to validate"
          />
          <button
            onClick={onValidate}
            disabled={loading || !email}
            className="w-full sm:w-auto bg-blue-500 text-white py-2 px-6 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Validating...</span>
              </>
            ) : (
              <>
                <Mail className="w-4 h-4" />
                <span>Validate</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}