
import React, { useRef, useEffect, useState } from 'react';
import { MindMapNode } from '../types';
import Tree from 'react-d3-tree';

interface Props {
  node: MindMapNode;
}

// Helper to convert our MindMapNode to react-d3-tree format
const convertToD3Tree = (node: MindMapNode): any => {
  return {
    name: node.label || (node as any).name || (node as any).root || 'Root',
    children: node.children ? node.children.map(convertToD3Tree) : undefined,
  };
};

// Helper to wrap text
const wrapText = (text: string, maxCharsPerLine: number) => {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  words.forEach(word => {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  if (currentLine) lines.push(currentLine.trim());
  return lines;
};

export const MindMap: React.FC<Props> = ({ node }) => {
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const dimensions = containerRef.current.getBoundingClientRect();
      setTranslate({
        x: dimensions.width / 6, // Position near the left for horizontal layout
        y: dimensions.height / 2, // Center vertically
      });
    }
  }, []);

  const d3Data = convertToD3Tree(node);

  // Custom node rendering using pure SVG for perfect exports
  const renderCustomNodeElement = ({ nodeDatum, toggleNode }: any) => {
    const lines = wrapText(nodeDatum.name, 30);
    const lineHeight = 18;
    const padding = 16;
    const height = Math.max(50, lines.length * lineHeight + padding * 2);
    const width = 230;
    
    return (
      <g onClick={toggleNode} className="cursor-pointer" style={{ cursor: 'pointer' }}>
        <rect
          x="0"
          y={-height / 2}
          width={width}
          height={height}
          rx="12"
          fill="#1e293b" // slate-800
          stroke="#6366f1" // indigo-500
          strokeWidth="2"
          filter="drop-shadow(0 4px 6px rgba(0,0,0,0.3))"
        />
        <text
          fill="#f8fafc" // slate-50
          x={width / 2}
          y={0}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="14px"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {lines.map((line, i) => (
            <tspan 
              x={width / 2} 
              dy={i === 0 ? -(lines.length - 1) * (lineHeight / 2) : lineHeight} 
              key={i}
            >
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  return (
    <div 
      ref={containerRef} 
      className="w-full h-[600px] bg-slate-900 rounded-xl overflow-hidden shadow-inner border border-slate-700"
    >
      <Tree
        data={d3Data}
        translate={translate}
        orientation="horizontal"
        pathFunc="diagonal" // Curved lines
        renderCustomNodeElement={renderCustomNodeElement}
        nodeSize={{ x: 300, y: 150 }} // Clear spacing between nodes
        separation={{ siblings: 1, nonSiblings: 1.5 }}
        zoomable={true}
        collapsible={true}
      />
    </div>
  );
};
