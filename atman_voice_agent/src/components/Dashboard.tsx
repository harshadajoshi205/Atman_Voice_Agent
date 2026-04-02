import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, User, Phone, MapPin, Settings, CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, FileText, Table as TableIcon } from 'lucide-react';

interface LeadData {
  id: number;
  user_name: string;
  user_contact_number: string;
  gauge_number: string;
  current_number_of_machines: string;
  required_number_of_machines: string;
  machine_type: string;
  hosiery_location: string;
  meeting_scheduled_on: string;
  interested_or_not: string;
  when_user_wants_machines: string;
  created_at: string;
}

interface LogEntry {
  id: number;
  timestamp: string;
  summary: string;
  interest_status: string;
  contact_number: string;
  meeting_date: string;
  transcript_text: string;
  lead_data?: LeadData;
}

interface DashboardProps {
  logs: LogEntry[];
  leads: LeadData[];
}

export const Dashboard: React.FC<DashboardProps> = ({ logs, leads }) => {
  const [expandedLog, setExpandedLog] = React.useState<number | null>(null);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="w-full space-y-8 pb-20">
      {/* Lead Information Table */}
      <section className="glass-card overflow-hidden">
        <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TableIcon size={18} className="text-purple-400" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-purple-200">Structured Lead Information</h2>
          </div>
          <span className="text-[10px] text-purple-300/50 uppercase font-mono">Total Leads: {leads.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white/5 text-[10px] uppercase tracking-wider text-purple-300/70">
                <th className="p-4 font-semibold border-b border-white/10">Date/Time</th>
                <th className="p-4 font-semibold border-b border-white/10">User Name</th>
                <th className="p-4 font-semibold border-b border-white/10">Contact</th>
                <th className="p-4 font-semibold border-b border-white/10">Gauge</th>
                <th className="p-4 font-semibold border-b border-white/10">Machines (C/R)</th>
                <th className="p-4 font-semibold border-b border-white/10">Type</th>
                <th className="p-4 font-semibold border-b border-white/10">Location</th>
                <th className="p-4 font-semibold border-b border-white/10">Meeting</th>
                <th className="p-4 font-semibold border-b border-white/10">Interested</th>
              </tr>
            </thead>
            <tbody className="text-xs text-purple-100">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-purple-300/30 italic">No leads captured yet.</td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-white/5 transition-colors border-b border-white/5">
                    <td className="p-4 whitespace-nowrap opacity-60 font-mono">{formatDate(lead.created_at)}</td>
                    <td className="p-4 font-medium">{lead.user_name}</td>
                    <td className="p-4 font-mono">{lead.user_contact_number}</td>
                    <td className="p-4">{lead.gauge_number}</td>
                    <td className="p-4">{lead.current_number_of_machines} / {lead.required_number_of_machines}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        lead.machine_type === 'New' ? 'bg-emerald-500/20 text-emerald-300' :
                        lead.machine_type === 'Renew' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-amber-500/20 text-amber-300'
                      }`}>
                        {lead.machine_type}
                      </span>
                    </td>
                    <td className="p-4">{lead.hosiery_location}</td>
                    <td className="p-4 text-purple-400 font-medium">{lead.meeting_scheduled_on}</td>
                    <td className="p-4">
                      {lead.interested_or_not === 'yes' ? (
                        <CheckCircle size={16} className="text-emerald-400" />
                      ) : lead.interested_or_not === 'no' ? (
                        <XCircle size={16} className="text-red-400" />
                      ) : (
                        <span className="text-purple-300/30">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Call History / Logs */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 px-2">
          <Clock size={18} className="text-purple-400" />
          <h2 className="text-sm font-bold uppercase tracking-widest text-purple-200">Call History & Logs</h2>
        </div>
        
        <div className="space-y-3">
          {logs.length === 0 ? (
            <div className="glass-card p-10 text-center text-purple-300/30 italic">No call logs available.</div>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="glass-card overflow-hidden transition-all">
                <div 
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5"
                  onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      log.interest_status === 'yes' ? 'bg-emerald-500/10 text-emerald-400' : 
                      log.interest_status === 'no' ? 'bg-red-500/10 text-red-400' : 
                      'bg-white/5 text-purple-300'
                    }`}>
                      <Phone size={18} />
                    </div>
                    <div>
                      <div className="text-xs font-mono text-purple-300/50">{formatDate(log.timestamp)}</div>
                      <div className="text-sm font-medium text-purple-100">{log.summary}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="hidden md:flex flex-col items-end">
                      <div className="text-[10px] uppercase tracking-wider text-purple-300/40">Meeting</div>
                      <div className="text-xs font-medium text-purple-200">{log.meeting_date}</div>
                    </div>
                    {expandedLog === log.id ? <ChevronUp size={20} className="text-purple-400" /> : <ChevronDown size={20} className="text-purple-400" />}
                  </div>
                </div>

                {expandedLog === log.id && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="border-t border-white/10 bg-black/20 p-6 grid grid-cols-1 md:grid-cols-2 gap-8"
                  >
                    {/* Transcript View */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-purple-300/60 font-bold">
                        <FileText size={12} />
                        Full Transcript
                      </div>
                      <div className="bg-black/40 rounded-xl p-4 h-64 overflow-y-auto text-xs leading-relaxed text-purple-100/80 whitespace-pre-wrap font-hindi">
                        {log.transcript_text}
                      </div>
                    </div>

                    {/* Structured Data View */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-purple-300/60 font-bold">
                        <Settings size={12} />
                        Extracted Lead Data
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 grid grid-cols-2 gap-4">
                        {[
                          { label: 'Name', value: log.lead_data?.user_name },
                          { label: 'Contact', value: log.lead_data?.user_contact_number },
                          { label: 'Gauge', value: log.lead_data?.gauge_number },
                          { label: 'Machines', value: `${log.lead_data?.current_number_of_machines} / ${log.lead_data?.required_number_of_machines}` },
                          { label: 'Type', value: log.lead_data?.machine_type },
                          { label: 'Location', value: log.lead_data?.hosiery_location },
                          { label: 'Meeting', value: log.lead_data?.meeting_scheduled_on },
                          { label: 'Timeline', value: log.lead_data?.when_user_wants_machines },
                        ].map((item, i) => (
                          <div key={i} className="space-y-1">
                            <div className="text-[10px] text-purple-300/40 uppercase">{item.label}</div>
                            <div className="text-xs text-purple-100">{item.value || '-'}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
};
