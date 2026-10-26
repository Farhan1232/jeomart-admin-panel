<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Runs the bidding / counter-offer dispatcher.
 *
 * Same shape as CabScheduleRide: the scheduler calls this every minute and it
 * shells out to the node script. The script itself exits immediately while
 * settings/biddingSettings.enabled is false, so scheduling it costs nothing
 * when the feature is switched off.
 */
class CabBiddingDispatch extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:cab-bidding-dispatch';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Executes the cabBiddingDispatch.js file';

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
            $command = $node_path.' '.escapeshellarg(storage_path('app/firebase/cabBiddingDispatch.js'));

            $output = shell_exec($command." /dev/null 2>&1");

            // Log the output
            \Log::info('Cab Bidding Dispatch Output: ' . $output);

            $this->info('Cab Bidding Dispatch Process executed.');

        }else{

            // Log the output
            \Log::info('Cab Bidding Dispatch Output: Node path is not defined');
        }
    }
}
