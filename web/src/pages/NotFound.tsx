import React from 'react';
import { Link } from 'react-router-dom';

export const NotFound: React.FC = () => (
  <div className="mx-auto max-w-md px-4 py-24 text-center">
    <h1 className="text-5xl font-bold text-white">404</h1>
    <p className="mt-3 text-slate-400">This page doesn’t exist.</p>
    <Link to="/" className="mt-6 inline-block text-blue-400 hover:text-blue-300">Back to the home page</Link>
  </div>
);
