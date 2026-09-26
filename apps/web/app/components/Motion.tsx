"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Rise({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.22, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function Press({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} whileTap={reduce ? undefined : { scale: 0.98 }}>
      {children}
    </motion.div>
  );
}
