import React from 'react';

interface VelocityVectorsProps {
    vh: number;
    vv: number;
}

export const VelocityVectors: React.FC<VelocityVectorsProps> = ({ vh, vv }) => {
    return (
        <div className="ah-vh-vv-container">
            <div className="ah-vv-box">
                <div className="ah-vv-label-row">
                    Vv
                    <div className="ah-red-dot" />
                </div>
                <span className="ah-vel-val">{Math.abs(vh).toFixed(1)} m/s</span>
            </div>

            <div className="ah-arrows-box">
                <div className="ah-arrow-h-line" />
                <div className="ah-arrow-h-head" />
                <div className="ah-arrow-v-line" />
                <div className="ah-arrow-v-head" />
            </div>

            <div className="ah-vh-box">
                <div className="ah-vh-label-row">
                    <div className="ah-green-dot" />
                    Vh
                </div>
                <span className="ah-vel-val">{Math.abs(vv).toFixed(1)} m/s</span>
            </div>
        </div>
    );
};
