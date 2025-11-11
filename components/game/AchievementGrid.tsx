"use client";
import { ACHIEVEMENTS } from "@/lib/constants";

export function AchievementGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {ACHIEVEMENTS.map((achievement) => (
        <div key={achievement.id} className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <span className="text-2xl">{achievement.icon}</span>
              {achievement.name}
            </div>
          </div>
          <div className="card-content">
            <p className="text-sm text-slate-600 mb-2">{achievement.description}</p>
            <div className="flex items-center justify-between">
              <span className="badge badge-soft">{achievement.rarity}</span>
              <span className="text-xs text-slate-500">{achievement.requirement}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}