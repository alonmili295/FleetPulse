import { decodeWsMessage } from './ws.decoder';

describe('decodeWsMessage', () => {
  // ── Happy paths ───────────────────────────────────────────────────────────────

  it('returns a typed registered message for a valid registered frame', () => {
    const raw = JSON.stringify({ type: 'registered', dispatcherId: 'dispatcher_abc' });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('registered');
    if (result.type === 'registered') expect(result.dispatcherId).toBe('dispatcher_abc');
  });

  it('returns a typed pong message', () => {
    const raw = JSON.stringify({ type: 'pong', timestamp: 1700000000000 });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('pong');
  });

  it('returns a typed dispatcher_joined message', () => {
    const raw = JSON.stringify({
      type: 'dispatcher_joined',
      dispatcherId: 'dispatcher_xyz',
      name: 'Alice',
      activeDispatchers: 3,
      timestamp: 1700000000000,
    });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('dispatcher_joined');
    if (result.type === 'dispatcher_joined') expect(result.name).toBe('Alice');
  });

  it('returns a typed dispatcher_left message', () => {
    const raw = JSON.stringify({ type: 'dispatcher_left', dispatcherId: 'dispatcher_xyz', activeDispatchers: 1, timestamp: 1700000000000 });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('dispatcher_left');
  });

  it('returns a typed dispatcher_viewing message', () => {
    const raw = JSON.stringify({ type: 'dispatcher_viewing', dispatcherId: 'dispatcher_xyz', truckId: 'truck_5', timestamp: 1700000000000 });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('dispatcher_viewing');
    if (result.type === 'dispatcher_viewing') expect(result.truckId).toBe('truck_5');
  });

  it('returns a typed route_assigned message when route object is present', () => {
    const raw = JSON.stringify({ type: 'route_assigned', route: { id: 'route_1', _version: 1 }, truckId: 'truck_1', assignedBy: 'dispatcher_xyz', truckVersion: 2, timestamp: 1700000000000 });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('route_assigned');
  });

  it('returns a typed truck_alert message when alert object is present', () => {
    const raw = JSON.stringify({ type: 'truck_alert', alert: { id: 'uuid', truckId: 'truck_1', message: 'low fuel' } });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('truck_alert');
  });

  it('returns a typed fleet_reset message (no required fields beyond type)', () => {
    const raw = JSON.stringify({ type: 'fleet_reset', timestamp: 1700000000000 });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('fleet_reset');
  });

  it('returns a typed error message', () => {
    const raw = JSON.stringify({ type: 'error', message: 'Invalid JSON' });
    const result = decodeWsMessage(raw);
    expect(result.type).toBe('error');
  });

  // ── Malformed / unknown ───────────────────────────────────────────────────────

  it('returns unknown for malformed JSON', () => {
    const result = decodeWsMessage('{bad json]');
    expect(result.type).toBe('unknown');
    if (result.type === 'unknown') expect(result.raw).toBe('{bad json]');
  });

  it('returns unknown for a JSON object with no type field', () => {
    const result = decodeWsMessage(JSON.stringify({ dispatcherId: 'x' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for an unrecognised type string', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'custom_event' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for a client→server type (register_dispatcher)', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'register_dispatcher', name: 'Alice' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for a bare JSON string (not an object)', () => {
    const result = decodeWsMessage('"just a string"');
    expect(result.type).toBe('unknown');
  });

  // ── Shape validation per known type ──────────────────────────────────────────

  it('returns unknown for registered without dispatcherId', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'registered' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for pong without timestamp', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'pong' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for dispatcher_joined without name', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'dispatcher_joined', dispatcherId: 'x' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for dispatcher_left without dispatcherId', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'dispatcher_left', activeDispatchers: 0 }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for dispatcher_viewing without truckId', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'dispatcher_viewing', dispatcherId: 'x' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for route_assigned without a route object', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'route_assigned', truckId: 'truck_1' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for truck_alert without an alert object', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'truck_alert' }));
    expect(result.type).toBe('unknown');
  });

  it('returns unknown for error without a message string', () => {
    const result = decodeWsMessage(JSON.stringify({ type: 'error' }));
    expect(result.type).toBe('unknown');
  });
});
