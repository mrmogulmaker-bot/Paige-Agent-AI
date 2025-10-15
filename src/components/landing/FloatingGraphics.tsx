import { useEffect, useState } from "react";

interface FloatingShape {
  id: number;
  size: number;
  left: string;
  top: string;
  delay: number;
  duration: number;
  shape: "circle" | "square" | "triangle";
}

export function FloatingGraphics() {
  const [shapes, setShapes] = useState<FloatingShape[]>([]);

  useEffect(() => {
    // Generate random floating shapes
    const generateShapes = (): FloatingShape[] => {
      const shapeTypes: ("circle" | "square" | "triangle")[] = ["circle", "square", "triangle"];
      const newShapes: FloatingShape[] = [];
      
      for (let i = 0; i < 8; i++) {
        newShapes.push({
          id: i,
          size: Math.random() * 60 + 40, // 40-100px
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          delay: Math.random() * 5,
          duration: Math.random() * 10 + 15, // 15-25s
          shape: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
        });
      }
      
      return newShapes;
    };

    setShapes(generateShapes());
  }, []);

  const getShapeClasses = (shape: "circle" | "square" | "triangle") => {
    switch (shape) {
      case "circle":
        return "rounded-full";
      case "square":
        return "rounded-lg rotate-45";
      case "triangle":
        return "rounded-sm";
      default:
        return "rounded-full";
    }
  };

  const getShapeStyles = (shape: FloatingShape) => {
    const baseStyle = {
      width: `${shape.size}px`,
      height: `${shape.size}px`,
      left: shape.left,
      top: shape.top,
      animationDelay: `${shape.delay}s`,
      animationDuration: `${shape.duration}s`,
    };

    // For triangle, use clip-path
    if (shape.shape === "triangle") {
      return {
        ...baseStyle,
        clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
      };
    }

    return baseStyle;
  };

  return (
    <div className="fixed inset-0 -z-50 pointer-events-none overflow-hidden">
      {shapes.map((shape) => (
        <div
          key={shape.id}
          className={`absolute opacity-5 ${getShapeClasses(shape.shape)} 
            bg-gradient-to-br from-accent/20 via-primary/20 to-success/20
            animate-float-gentle blur-xl`}
          style={getShapeStyles(shape)}
        />
      ))}
    </div>
  );
}
