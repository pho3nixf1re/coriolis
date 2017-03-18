import React from 'react';
import TranslatedComponent from './TranslatedComponent';
import { Ships } from 'coriolis-data/dist';
import ShipSelector from './ShipSelector';
import { nameComparator } from '../utils/SlotFunctions';
import { CollapseSection, ExpandSection, MountFixed, MountGimballed, MountTurret } from './SvgIcons';
import LineChart from '../components/LineChart';
import Slider from '../components/Slider';
import * as Calc from '../shipyard/Calculations';
import Module from '../shipyard/Module';

const DAMAGE_DEALT_COLORS = ['#FFFFFF', '#FF0000', '#00FF00', '#7777FF', '#FFFF00', '#FF00FF', '#00FFFF', '#777777'];

/**
 * Weapon damage chart
 */
export default class WeaponDamageChart extends TranslatedComponent {
  static propTypes = {
    ship: React.PropTypes.object.isRequired,
    opponent: React.PropTypes.object.isRequired,
    hull: React.PropTypes.bool.isRequired,
    engagementRange: React.PropTypes.number.isRequired,
    marker: React.PropTypes.string.isRequired
  };

  /**
   * Constructor
   * @param  {Object} props   React Component properties
   * @param  {Object} context   React Component context
   */
  constructor(props, context) {
    super(props);

    const { ship, opponent, hull } = this.props;

    const maxRange = this._calcMaxRange(ship);
    // We take whichever is the higher for shields and hull to ensure same Y axis for both
    const maxDps = Math.max(this._calcMaxSDps(ship, opponent, true), this._calcMaxSDps(ship, opponent, false));

    this.state = {
      maxRange,
      maxDps
    };
  }

  /**
   * Set the initial weapons state
   */
  componentWillMount() {
    const weaponNames = this._weaponNames(this.props.ship, this.context);
    this.setState({ weaponNames, calcSDpsFunc: this._calcSDps.bind(this, this.props.ship, weaponNames, this.props.opponent, this.props.hull) });
  }

  /**
   * Set the updated weapons state if our ship changes
   * @param  {Object} nextProps   Incoming/Next properties
   * @param  {Object} nextContext Incoming/Next conext
   * @return {boolean}            Returns true if the component should be rerendered
   */
  componentWillReceiveProps(nextProps, nextContext) {
    if (nextProps.marker != this.props.marker) {
      const weaponNames = this._weaponNames(nextProps.ship, nextContext);
      const maxRange = this._calcMaxRange(nextProps.ship);
      // We take whichever is the higher for shields and hull to ensure same Y axis for both
      const maxDps = Math.max(this._calcMaxSDps(nextProps.ship, nextProps.opponent, true), this._calcMaxSDps(nextProps.ship, nextProps.opponent, false));
      this.setState({ weaponNames,
                      maxRange,
                      maxDps,
                      calcSDpsFunc: this._calcSDps.bind(this, nextProps.ship, weaponNames, nextProps.opponent, nextProps.hull)
      });
    }
    return true;
  }

  /**
   * Calculate the maximum range of a ship's weapons
   * @param   {Object}  ship     The ship
   * @returns {int}              The maximum range, in metres
   */ 
  _calcMaxRange(ship) {
    let maxRange = 1000; // Minimum
    for (let i = 0; i < ship.hardpoints.length; i++) {
      if (ship.hardpoints[i].maxClass > 0 && ship.hardpoints[i].m && ship.hardpoints[i].enabled) {
        const thisRange = ship.hardpoints[i].m.getRange();
        if (thisRange > maxRange) {
          maxRange = thisRange;
        }
      }
    }

    return maxRange;
  }

  /**
   * Calculate the maximum sustained single-weapon DPS for this ship
   * @param  {Object}  ship      The ship
   * @param  {Object}  opponent  The opponent ship
   * @param  {bool}    hull      True if against hull
   * @return {number}            The maximum sustained single-weapon DPS
   */
  _calcMaxSDps(ship, opponent, hull) {
    // Additional information to allow effectiveness calculations
    const defence = hull ? Calc.armourMetrics(opponent) : Calc.shieldMetrics(opponent, 4);
    let maxSDps = 0;
    for (let i = 0; i < ship.hardpoints.length; i++) {
      if (ship.hardpoints[i].maxClass > 0 && ship.hardpoints[i].m && ship.hardpoints[i].enabled) {
        const m = ship.hardpoints[i].m;
        const thisSDps = this._calcWeaponSDps(ship, m, opponent, defence, 0);
        if (thisSDps > maxSDps) {
          maxSDps = thisSDps;
        }
      }
    }
    return maxSDps;
  }

  /**
   * Obtain the weapon names for this ship
   * @param  {Object}  ship      The ship
   * @param  {Object}  context   The context
   * @return {array}             The weapon names
   */
  _weaponNames(ship, context) {
    const translate = context.language.translate;
    let names = [];
    let num = 1;
    for (let i = 0; i < ship.hardpoints.length; i++) {
      if (ship.hardpoints[i].maxClass > 0 && ship.hardpoints[i].m && ship.hardpoints[i].enabled) {
        const m = ship.hardpoints[i].m;
        let name = '' + num++ + ': ' + m.class + m.rating + (m.missile ? '/' + m.missile : '') + ' ' + translate(m.name || m.grp);
        let engineering;
        if (m.blueprint && m.blueprint.name) {
          engineering = translate(m.blueprint.name) + ' ' + translate('grade') + ' ' + m.blueprint.grade;
          if (m.blueprint.special && m.blueprint.special.id) {
            engineering += ', ' + translate(m.blueprint.special.name);
          }
        }
        if (engineering) {
          name = name + ' (' + engineering + ')';
        }
        names.push(name);
      }
    }
    return names;
  }

  /**
   * Calculate the per-weapon sustained DPS for this ship against another ship at a given range
   * @param  {Object}  ship            The ship
   * @param  {Object}  weaponNames     The names of the weapons for which to calculate DPS
   * @param  {Object}  opponent        The target
   * @param  {bool}    hull            true if to calculate against hull, false if to calculate against shields
   * @param  {Object}  engagementRange The engagement range
   * @return {array}                   The array of weapon DPS
   */
  _calcSDps(ship, weaponNames, opponent, hull, engagementRange) {
    // Additional information to allow effectiveness calculations
    const defence = hull ? Calc.armourMetrics(opponent) : Calc.shieldMetrics(opponent, 4);

    let results = {};
    let weaponNum = 0;
    for (let i = 0; i < ship.hardpoints.length; i++) {
      if (ship.hardpoints[i].maxClass > 0 && ship.hardpoints[i].m && ship.hardpoints[i].enabled) {
        const m = ship.hardpoints[i].m;
        results[weaponNames[weaponNum++]] = this._calcWeaponSDps(ship, m, opponent, defence, engagementRange);
      }
    }
    return results;
  }

  /**
   * Calculate the sustained DPS for a particular weapon for this ship against another ship at a given range
   * @param  {Object} ship             The ship that will deal the damage 
   * @param  {Object} m                The weapon that will deal the damage
   * @param  {Object} opponent         The ship against which damage will be dealt
   * @param  {Object} defence          defence metrics (either shield or hull)
   * @param  {Object} engagementRange  The engagement range
   * @return {object}                  Returns the sustained DPS for the weapon
   */
  _calcWeaponSDps(ship, m, opponent, defence, engagementRange) {
    let falloff = 1;
    if (m.getFalloff()) {
      // Calculate the falloff % due to range
      if (engagementRange > m.getRange()) {
        // Weapon is out of range
        falloff = 0;
      } else {
        const falloffPoint = m.getFalloff();
        if (engagementRange > falloffPoint) {
          const falloffRange = m.getRange() - falloffPoint;
          // Assuming straight-line falloff
          falloff = 1 - (engagementRange - falloffPoint) / falloffRange;
        }
      }
    }

    let effectiveness = 0;
    if (m.getDamageDist().E) {
      effectiveness += m.getDamageDist().E * defence.explosive.total;
    }
    if (m.getDamageDist().K) {
      effectiveness += m.getDamageDist().K * defence.kinetic.total;
    }
    if (m.getDamageDist().T) {
      effectiveness += m.getDamageDist().T * defence.thermal.total;
    }
    if (m.getDamageDist().A) {
      effectiveness += m.getDamageDist().A * defence.absolute.total;
    }

    // Return the final effective SDPS
    return (m.getClip() ?  (m.getClip() * m.getDps() / m.getRoF()) / ((m.getClip() / m.getRoF()) + m.getReload()) : m.getDps()) * falloff * effectiveness;
  }

  /**
   * Render damage dealt
   * @return {React.Component} contents
   */
  render() {
    const { language, onWindowResize, sizeRatio, tooltip, termtip } = this.context;
    const { formats, translate, units } = language;
    const { maxRange } = this.state;
    const { ship, opponent } = this.props;

    const sortOrder = this._sortOrder;
    const onCollapseExpand = this._onCollapseExpand;

    const code = `${ship.toString()}:${opponent.toString()}`;

    return (
      <span>
        <LineChart
          xMax={maxRange}
          yMax={this.state.maxDps}
          xLabel={translate('range')}
          xUnit={translate('m')}
          yLabel={translate('sdps')}
          series={this.state.weaponNames}
          colors={DAMAGE_DEALT_COLORS}
          func={this.state.calcSDpsFunc}
          points={200}
          code={code}
        />
      </span>
    );
  }
}
