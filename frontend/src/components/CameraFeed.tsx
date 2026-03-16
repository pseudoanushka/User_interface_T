import { useEffect, useRef } from 'react';

const IP = "192.168.43.136";

export function CameraFeed() {
    const imgRef = useRef<HTMLImageElement>(null);

    useEffect(() => {
        // Handle Video WebSocket
        const socket = new WebSocket(`ws://${IP}:8000/ws/video`);
        
        socket.onmessage = function(event) {
            if (imgRef.current) {
                const blob = new Blob([event.data], { type: "image/jpeg" });
                const url = URL.createObjectURL(blob);
                imgRef.current.src = url;
                // Clean up memory to avoid leaks
                imgRef.current.onload = () => URL.revokeObjectURL(url);
            }
        };

        return () => {
            socket.close();
        };
    }, []);

    // Handle HTTP Commands
    const cmd = (action: string) => {
        fetch(`http://${IP}:8000/${action}`)
            .then(() => console.log(`Command ${action} sent`))
            .catch(() => alert("Connection Failed"));
    };

    return (
        <div 
            style={{
                position: 'fixed',
                left: '42%',
                top: '2%',
                width: '40%',
                height: '50%',
                zIndex: 50,
                border: '2px solid #22d3ee',
                borderRadius: '0 0 0 12px',
                overflow: 'hidden',
                backgroundColor: '#000',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 0 20px rgba(34, 211, 238, 0.2)'
            }}
        >
            <div style={{ 
                backgroundColor: '#020617', 
                color: '#22d3ee', 
                padding: '8px', 
                textAlign: 'center', 
                fontWeight: 'bold', 
                borderBottom: '1px solid #22d3ee',
                fontFamily: '"Orbitron", monospace'
            }}>
                GROUND CONTROL STATION
            </div>
            
            <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                <img 
                    ref={imgRef} 
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                    alt="RPi Camera Stream" 
                />
            </div>

            <div style={{ 
                padding: '10px', 
                backgroundColor: '#1a1a1a', 
                display: 'flex', 
                flexWrap: 'wrap', 
                justifyContent: 'center', 
                gap: '10px',
                borderTop: '1px solid #22d3ee'
            }}>
                <button 
                    style={{ flex: '1 1 45%', padding: '10px', fontSize: '14px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: '#27ae60', color: 'white', fontWeight: 'bold' }} 
                    onClick={() => cmd('arm')}
                >
                    ARM DRONE
                </button>
                <button 
                    style={{ flex: '1 1 45%', padding: '10px', fontSize: '14px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: '#2980b9', color: 'white', fontWeight: 'bold' }} 
                    onClick={() => cmd('takeoff')}
                >
                    TAKEOFF
                </button>
                <button 
                    style={{ flex: '1 1 45%', padding: '10px', fontSize: '14px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: '#e67e22', color: 'white', fontWeight: 'bold' }} 
                    onClick={() => cmd('land')}
                >
                    LAND
                </button>
                <button 
                    style={{ flex: '1 1 45%', padding: '10px', fontSize: '14px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: '#c0392b', color: 'white', fontWeight: 'bold' }} 
                    onClick={() => cmd('disarm')}
                >
                    DISARM DRONE
                </button>
            </div>
        </div>
    );
}
