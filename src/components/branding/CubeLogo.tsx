
import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';

interface CubeLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showText?: boolean;
}

const CubeLogo: React.FC<CubeLogoProps> = ({ 
  size = 'md', 
  className = '', 
  showText = false 
}) => {
  const { theme, resolvedTheme } = useTheme();
  const [imageError, setImageError] = useState(false);
  
  const dimensions = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 48
  };

  const logoSize = dimensions[size];
  
  // Use the official DUKAFITI logo uploaded by the user
  const officialLogo = '/lovable-uploads/86a021d6-343a-46cb-bfbf-1c2edbc4ddf2.png';
  
  const handleImageError = () => {
    console.error('DUKAFITI Logo: Failed to load official logo');
    setImageError(true);
  };

  const handleImageLoad = () => {
    console.log('DUKAFITI Logo: Official logo loaded successfully');
    setImageError(false);
  };

  if (imageError) {
    // Fallback cube design when image fails to load
    return (
      <div 
        className={`flex items-center gap-3 ${className}`}
        style={{ width: logoSize, height: logoSize }}
      >
        <div 
          className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg"
          style={{ width: logoSize, height: logoSize, fontSize: logoSize * 0.4 }}
        >
          D
        </div>
        {showText && (
          <div className="flex flex-col">
            <span className="font-caesar font-bold text-lg text-gray-900 dark:text-white">
              DUKAFITI
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-400 italic">
              dukubora ni dukafiti
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <img 
        src={officialLogo}
        alt="DUKAFITI - Official Logo"
        width={logoSize} 
        height={logoSize}
        className="flex-shrink-0 transition-all duration-300 drop-shadow-sm"
        style={{ 
          width: logoSize, 
          height: logoSize,
          objectFit: 'contain'
        }}
        onError={handleImageError}
        onLoad={handleImageLoad}
        loading="eager"
      />
      {showText && (
        <div className="flex flex-col">
          <span className="font-caesar font-bold text-lg text-gray-900 dark:text-white tracking-wide">
            DUKAFITI
          </span>
          <span className="text-xs text-gray-600 dark:text-gray-400 italic font-medium">
            dukubora ni dukafiti
          </span>
        </div>
      )}
    </div>
  );
};

export default CubeLogo;
