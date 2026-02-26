import React from 'react';

interface CompassProps {
    /** The compass heading in degrees (0-360) */
    heading: number;
}

export const Compass: React.FC<CompassProps> = ({ heading }) => {
    return (
        <div className="flex flex-col items-center justify-center p-4">
            <div className="relative flex items-center justify-center w-64 h-64 bg-gray-100 border-8 border-gray-300 rounded-full shadow-xl">
                <span className="absolute text-xl font-bold text-red-600 top-4">N</span>
                <span className="absolute text-xl font-bold text-gray-600 right-4">E</span>
                <span className="absolute text-xl font-bold text-gray-600 bottom-4">S</span>
                <span className="absolute text-xl font-bold text-gray-600 left-4">W</span>
                <div className="absolute w-48 h-48 border-2 border-gray-200 rounded-full border-dashed"></div>
                <div
                    className="relative w-4 h-48 transition-transform duration-300 ease-out drop-shadow-md"
                    style={{ transform: `rotate(${heading}deg)` }}
                >
                    <div className="absolute top-0 left-0 w-full h-1/2 bg-red-500 rounded-t-full"></div>
                    <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gray-800 rounded-b-full"></div>
                </div>
                <div className="absolute w-6 h-6 bg-gray-200 border-4 border-gray-800 rounded-full shadow-sm z-10"></div>
            </div>
            <div className="mt-8 text-2xl font-mono font-semibold text-gray-700">
                {Math.round(heading)}°
            </div>
        </div>
    );
};
