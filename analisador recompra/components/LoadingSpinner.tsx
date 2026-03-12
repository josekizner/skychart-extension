
import React from 'react';

export const LoadingSpinner: React.FC = () => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-lg text-gray-300">Analisando dados...</p>
        <p className="text-sm text-gray-500">Isso pode levar alguns segundos.</p>
    </div>
);
