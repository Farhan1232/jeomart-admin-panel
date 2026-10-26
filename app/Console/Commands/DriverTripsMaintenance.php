<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Runs the driver-created trips housekeeping sweep.
 *
 * Same shape as CabScheduleRide and CabBiddingDispatch: the scheduler calls
 * this every minute and it shells out to the node script. The script does two
 * queries and writes nothing when there is nothing to expire, so scheduling it
 * costs almost nothing while no driver has posted a trip.
 */
class DriverTripsMaintenance extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:driver-trips-maintenance';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Executes the driverTripsMaintenance.js file';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $node_path = env('NODE_PATH','');

        if(!empty($node_path)){

            // Run the JS file using Node.js
            // escapeshellarg because storage_path() can contain spaces. The
            // six pre-existing sibling commands interpolate it bare; on a path
            // without spaces this is byte-identical to that, and on one with
            // spaces it is the difference between running and not.
            $command = $node_path.' '.escapeshellarg(storage_path('app/firebase/driverTripsMaintenance.js'));

            $output = shell_exec($command." /dev/null 2>&1");

            // Log the output
            \Log::info('Driver Trips Maintenance Output: ' . $output);

            $this->info('Driver Trips Maintenance Process executed.');

        }else{

            // Log the output
            \Log::info('Driver Trips Maintenance Output: Node path is not defined');
        }
    }
}
