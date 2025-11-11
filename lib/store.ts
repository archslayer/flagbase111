"use client";
import { create } from "zustand";
type Tx = { hash:string; type:"buy"|"sell"|"attack"|"referral"; timestamp:number; status?:"success"|"failed" };
type GameState = { recentTransactions: Tx[]; };
export const useGameStore = create<GameState>(()=>({ recentTransactions:[] }));
export const gameActions = {
  startTransaction(hash:string, type:Tx["type"]){
    const s = useGameStore.getState();
    useGameStore.setState({ recentTransactions: [{hash, type, timestamp: Date.now()}, ...s.recentTransactions].slice(0,50) });
  },
  completeTransaction(hash:string, status:"success"|"failed"){
    const s = useGameStore.getState();
    useGameStore.setState({ recentTransactions: s.recentTransactions.map(tx=> tx.hash===hash ? {...tx, status} : tx) });
  }
};
